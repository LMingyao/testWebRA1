import { escapeHTML as e, validateContent, currentYear } from "./shared.js";
import { renderGallery } from "./gallery.js";

const main = document.querySelector("main");
const page = document.body.dataset.page;
function aboutPage(content) {
  const s = content.site;
  main.innerHTML = `<section class="editorial"><p class="eyebrow">BEHIND THE LENS</p><div class="about-grid"><img class="about-photo" src="${e(s.aboutImage)}" alt="${e(s.name)}" width="1000" height="1250"><div class="about-copy"><p class="eyebrow">${e(s.location)}</p><h1>${e(s.aboutTitle)}</h1><p class="body-copy">${e(s.about)}</p><div class="gear"><h2>In my camera bag</h2><p>${e(s.gear)}</p></div><a class="text-link" href="contact.html">Let’s connect ↗</a></div></div></section>`;
}
function contactPage(content) {
  const s = content.site;
  main.innerHTML = `<section class="contact-page"><p class="eyebrow">GET IN TOUCH</p><h1>Let’s start<br>a conversation.</h1><div class="contact-details"><p>For photography enquiries, collaborations,<br>or simply to say hello.</p><a class="email-link" href="mailto:${e(s.email)}">${e(s.email)} <span>↗</span></a></div><p class="contact-location">${e(s.location)}</p></section>`;
}
try {
  const response = await fetch("content/gallery.json");
  if (!response.ok) throw new Error("Collection unavailable");
  const content = validateContent(await response.json());
  document
    .querySelector(".brand")
    .setAttribute(
      "aria-label",
      `${content.site.name} ${content.site.tagline} home`,
    );
  document.querySelector(".footer-name").textContent = content.site.name;
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
  if (page === "about") aboutPage(content);
  else if (page === "contact") contactPage(content);
  else renderGallery(main, content, page);
} catch (error) {
  main.innerHTML =
    '<section class="error-state"><h1>The collection is taking a moment.</h1><p>Please refresh the page or try again later.</p><button id="retry">Try again</button></section>';
  document.querySelector("#retry").onclick = () => location.reload();
  console.error(error);
}
const menu = document.querySelector(".menu-toggle");
const nav = document.querySelector("#navigation");
function setMenu(open) {
  menu.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
}
menu.onclick = () => setMenu(menu.getAttribute("aria-expanded") !== "true");
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    menu.focus();
  }
});
matchMedia("(max-width: 900px)").addEventListener("change", () =>
  setMenu(false),
);
