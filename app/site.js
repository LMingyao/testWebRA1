import { escapeHTML as e, validateContent } from "./shared.js";
import { collections, resolveCollection, siteSettings } from "./config.js";
import { applySiteChrome } from "./chrome.js";
import { loadPublicContent, contentForDisplay } from "./backend.js";
import { createNavigation } from "./navigation.js";
import { renderEditorial } from "./editorial.js";
import { categoryURL, categoryFromURL, pageMetadata, applyMetadata } from "./metadata.js";

const main = document.querySelector("main");
const page = document.body.dataset.page;
const isWork = ["portfolio", "portrait"].includes(page);
const { setMenu, setWorkMenu, workToggle, workMenu } = createNavigation();

try {
  const content = contentForDisplay(validateContent(await loadPublicContent()));
  applySiteChrome(content);
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === page) a.setAttribute("aria-current", "page");
  });
  const categories = collections(content);
  workMenu.innerHTML = categories
    .map(
      (c) =>
        `<a data-work="${e(c.id)}" href="${e(categoryURL(c.id, content))}">${e(c.label)}</a>`,
    )
    .join("");
  const renderGallery = isWork
    ? (await import("./gallery.js")).createGallery(
        main, document.querySelector("#layout-controls"), content,
      )
    : undefined;
  function selectedCategory() { return categoryFromURL(new URL(location.href), content); }
  function showWork(category) {
    const selected = resolveCollection(content, category);
    renderGallery(selected);
    workToggle.classList.add("is-current");
    const label =
      categories.find((c) => c.id === selected)?.label || "Portraits";
    workToggle.setAttribute("aria-label", `${siteSettings(content.site).workLabel} — ${label}`);
    workMenu.querySelectorAll("a").forEach((a) => {
      if (a.dataset.work === selected) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    applyMetadata(pageMetadata(content, page, selected));
  }
  if (page === "about" || page === "contact") { renderEditorial(main, content, page); applyMetadata(pageMetadata(content, page)); }
  else showWork(selectedCategory());
  const backTop = document.querySelector(".back-top");
  const updateBackTop = () => { backTop.hidden = document.documentElement.scrollHeight <= innerHeight * 1.4; };
  new ResizeObserver(updateBackTop).observe(main);
  window.addEventListener("resize", updateBackTop);
  updateBackTop();
  if (isWork) {
    workMenu.onclick = (event) => {
      const link = event.target.closest("[data-work]");
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState(null, "", link.href);
      showWork(link.dataset.work);
      setWorkMenu(false);
      setMenu(false);
      workToggle.focus();
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("popstate", () => showWork(selectedCategory()));
  }
} catch (error) {
  main.innerHTML =
    '<section class="error-state"><h1>The collection is taking a moment.</h1><p>Please refresh the page or try again later.</p><button id="retry">Try again</button></section>';
  document.querySelector("#retry").onclick = () => location.reload();
  console.error(error);
}
