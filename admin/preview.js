import { createGallery } from "../app/gallery.js";
import { renderEditorial } from "../app/editorial.js";
import { escapeHTML as e } from "../app/shared.js";
import { collections, defaultCollection, siteSettings } from "../app/config.js";
import { applySiteChrome } from "../app/chrome.js";
import { createNavigation } from "../app/navigation.js";
import { categoryURL } from "../app/metadata.js";
const { setMenu, setWorkMenu, workToggle, workMenu } = createNavigation();
let gallery, home = "all";
window.addEventListener("message", event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== "gallery-preview") return;
  gallery?.destroy();
  gallery = undefined;
  const { content, category, page } = event.data;
  home = defaultCollection(content);
  applySiteChrome(content);
  const main = document.querySelector("main"), controls = document.querySelector("#layout-controls");
  document.body.dataset.page = page;
  controls.innerHTML = "";
  if (page === "portfolio") {
    gallery = createGallery(main, controls, content);
    gallery(category);
  } else renderEditorial(main, content, page);
  document.querySelector(".back-top").hidden = true;
  const categories = collections(content);
  workMenu.innerHTML = categories.map(c => `<a data-work="${e(c.id)}" href="${e(categoryURL(c.id, content))}" ${page === "portfolio" && c.id === category ? 'aria-current="page"' : ""}>${e(c.label)}</a>`).join("");
  workToggle.classList.toggle("is-current", page === "portfolio");
  document.querySelectorAll("[data-nav]").forEach(link => {
    if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const label = collections(content, { includeHidden: true }).find(item => item.id === category)?.label || "Selected work";
  document.querySelector(".work-toggle").setAttribute("aria-label", `${siteSettings(content.site).workLabel} — ${label}`);
});
// Parent owns navigation; links in the draft cannot replace the preview frame.
document.addEventListener("click", event => {
  const link = event.target.closest("a:not([target='_blank'])");
  if (!link) return;
  event.preventDefault();
  if (link.classList.contains("back-top")) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  const value = link.dataset.work || (link.dataset.nav ? `page:${link.dataset.nav}` : link.getAttribute("href") === "contact.html" ? "page:contact" : home);
  setWorkMenu(false); setMenu(false);
  parent.postMessage({ type: "gallery-preview-navigate", value }, location.origin);
});
parent.postMessage({ type: "gallery-preview-ready" }, location.origin);
