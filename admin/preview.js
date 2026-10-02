import { createGallery } from "../app/gallery.js";
import { renderEditorial } from "../app/editorial.js";
import { escapeHTML as e, currentYear } from "../app/shared.js";
import { createNavigation } from "../app/navigation.js";
import { categoryURL } from "../app/metadata.js";
const { setMenu, setWorkMenu, workToggle, workMenu } = createNavigation();
let gallery;
window.addEventListener("message", event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== "gallery-preview") return;
  gallery?.destroy();
  gallery = undefined;
  const { content, category, page } = event.data;
  const main = document.querySelector("main"), controls = document.querySelector("#layout-controls");
  document.body.dataset.page = page;
  controls.innerHTML = "";
  if (page === "portfolio") {
    gallery = createGallery(main, controls, content);
    gallery(category);
  } else renderEditorial(main, content, page);
  document.querySelector(".footer-name").textContent = content.site.name;
  document.querySelector("#copyright").textContent = `© ${currentYear()} ${content.site.name}. All rights reserved.`;
  document.querySelector("#social-links").innerHTML = content.site.socials.map((social, i) =>
    `<a class="${i < 2 ? "social-primary" : "social-secondary"}" href="${e(social.url)}" target="_blank" rel="noopener noreferrer">${e(social.label)} ↗</a>`).join("");
  document.querySelector(".back-top").hidden = true;
  const categories = [{ id: "all", label: "Selected work" }, ...content.categories.filter(c => content.photos.some(photo => photo.published && photo.category === c.id))];
  workMenu.innerHTML = categories.map(c => `<a data-work="${e(c.id)}" href="${e(categoryURL(c.id))}" ${page === "portfolio" && c.id === category ? 'aria-current="page"' : ""}>${e(c.label)}</a>`).join("");
  workToggle.classList.toggle("is-current", page === "portfolio");
  document.querySelectorAll("[data-nav]").forEach(link => {
    if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const label = content.categories.find(item => item.id === category)?.label || "Selected work";
  document.querySelector(".work-toggle").setAttribute("aria-label", `Work — ${label}`);
});
// Parent owns navigation; links in the draft cannot replace the preview frame.
document.addEventListener("click", event => {
  const link = event.target.closest("a:not([target='_blank'])");
  if (!link) return;
  event.preventDefault();
  const value = link.dataset.work || (link.dataset.nav ? `page:${link.dataset.nav}` : "all");
  setWorkMenu(false); setMenu(false);
  parent.postMessage({ type: "gallery-preview-navigate", value }, location.origin);
});
parent.postMessage({ type: "gallery-preview-ready" }, location.origin);
