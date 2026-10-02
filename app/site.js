import { escapeHTML as e, validateContent, currentYear } from "./shared.js";
import { loadPublicContent, contentForDisplay } from "./backend.js";

const main = document.querySelector("main");
const page = document.body.dataset.page;
const isWork = ["portfolio", "portrait"].includes(page);
const menu = document.querySelector(".menu-toggle"),
  nav = document.querySelector("#navigation");
const workToggle = document.querySelector(".work-toggle"),
  workMenu = document.querySelector("#work-menu");
function setMenu(open) {
  menu.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
}
function setWorkMenu(open) {
  workToggle.setAttribute("aria-expanded", String(open));
  workMenu.hidden = !open;
}
menu.onclick = () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  setMenu(open);
  if (!open) setWorkMenu(false);
};
workToggle.onclick = () => setWorkMenu(workMenu.hidden);
workToggle.addEventListener("keydown", event => {
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  const links = [...workMenu.querySelectorAll("a")];
  if (!links.length) return;
  event.preventDefault();
  setWorkMenu(true);
  (event.key === "ArrowDown" ? links[0] : links.at(-1)).focus();
});
workMenu.addEventListener("keydown", event => {
  const links = [...workMenu.querySelectorAll("a")];
  const index = links.indexOf(document.activeElement);
  if (index < 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1
    : (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
  links[next].focus();
});
document.querySelector(".work-navigation").addEventListener("focusout", event => {
  if (!event.currentTarget.contains(event.relatedTarget)) setWorkMenu(false);
});
document.querySelector(".site-header").addEventListener("focusout", event => {
  if (!event.currentTarget.contains(event.relatedTarget)) setMenu(false);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".work-navigation")) setWorkMenu(false);
  if (!event.target.closest(".site-header")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!workMenu.hidden) {
    setWorkMenu(false);
    workToggle.focus();
  } else if (menu.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    menu.focus();
  }
});
matchMedia("(max-width: 900px)").addEventListener("change", () => {
  setMenu(false);
  setWorkMenu(false);
});

function aboutPage(content) {
  const s = content.site;
  main.innerHTML = `<section class="editorial"><p class="eyebrow">ABOUT</p><div class="about-grid"><img class="about-photo" src="${e(s.aboutImage)}" alt="${e(s.name)}"><div class="about-copy"><p class="eyebrow">${e(s.location)}</p><h1>${e(s.aboutTitle)}</h1><p class="body-copy">${e(s.about)}</p><details class="gear"><summary>Camera &amp; lenses</summary><p>${e(s.gear)}</p></details><a class="text-link" href="contact.html">Photography enquiries ↗</a></div></div></section>`;
}
function contactPage(content) {
  const s = content.site;
  main.innerHTML = `<section class="contact-page"><p class="eyebrow">CONTACT</p><h1>Get in touch.</h1><div class="contact-details"><p>Photography enquiries and collaborations.</p><a class="email-link" href="mailto:${e(s.email)}">${e(s.email)} <span aria-hidden="true">↗</span></a></div><p class="contact-location">${e(s.name)} · ${e(s.location)}</p></section>`;
}
try {
  const content = contentForDisplay(validateContent(await loadPublicContent()));
  document
    .querySelector(".brand")
    .setAttribute(
      "aria-label",
      `${content.site.name} ${content.site.tagline} home`,
    );
  document.querySelector(".footer-name").textContent = content.site.name;
  document.querySelector('meta[name="description"]').content =
    content.site.description;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === page) a.setAttribute("aria-current", "page");
  });
  document.querySelector("#social-links").innerHTML = content.site.socials
    .map(
      (s) =>
        `<a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${e(s.label)} ↗</a>`,
    )
    .join("");
  document.querySelector("#copyright").textContent =
    `© ${currentYear()} ${content.site.name}. All rights reserved.`;
  const categories = [
    { id: "all", label: "Selected work" },
    ...content.categories.filter((c) =>
      content.photos.some((p) => p.published && p.category === c.id),
    ),
  ];
  workMenu.innerHTML = categories
    .map(
      (c) =>
        `<a data-work="${e(c.id)}" href="${c.id === "all" ? "index.html" : c.id === "portrait" ? "ptr.html" : `index.html?category=${e(c.id)}`}">${e(c.label)}</a>`,
    )
    .join("");
  const renderGallery = isWork
    ? (await import("./gallery.js")).createGallery(
        main, document.querySelector("#layout-controls"), content,
      )
    : undefined;
  function selectedCategory() {
    return (
      new URLSearchParams(location.search).get("category") ||
      (location.pathname.endsWith("/ptr.html") ? "portrait" : "all")
    );
  }
  function showWork(category) {
    const selected =
      categories.some((c) => c.id === category) || category === "portrait"
        ? category
        : "all";
    renderGallery(selected);
    workToggle.classList.add("is-current");
    const label =
      categories.find((c) => c.id === selected)?.label || "Portraits";
    workToggle.setAttribute("aria-label", `Work — ${label}`);
    workMenu.querySelectorAll("a").forEach((a) => {
      if (a.dataset.work === selected) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = `${label} · ${content.site.name} Photography`;
  }
  if (page === "about") aboutPage(content);
  else if (page === "contact") contactPage(content);
  else showWork(selectedCategory());
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
