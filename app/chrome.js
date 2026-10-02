import { escapeHTML as e, currentYear } from "./shared.js";
import { siteSettings } from "./config.js";

export function applySiteChrome(content) {
  const site = siteSettings(content.site);
  document.querySelectorAll(".logo-name").forEach(node => { node.textContent = site.brandName; });
  document.querySelectorAll(".logo-title").forEach(node => { node.textContent = site.brandTitle; });
  document.querySelector(".brand")?.setAttribute("aria-label", `${site.name} ${site.brandTitle} home`);
  const work = document.querySelector(".work-toggle");
  if (work) work.firstChild.textContent = `${site.workLabel} `;
  for (const page of ["about", "contact"]) {
    const link = document.querySelector(`[data-nav="${page}"]`);
    if (link) { link.textContent = site[`${page}Label`]; link.hidden = !site[`show${page[0].toUpperCase()}${page.slice(1)}`]; }
  }
  const name = document.querySelector(".footer-name");
  if (name) name.textContent = site.name;
  const copyright = document.querySelector("#copyright");
  if (copyright) copyright.textContent = `© ${currentYear()} ${site.name}${site.footerText ? `. ${site.footerText}` : ""}`;
  const social = document.querySelector("#social-links");
  if (social) social.innerHTML = site.socials.map((item, i) =>
    `<a class="${i < 2 ? "social-primary" : "social-secondary"}" href="${e(item.url)}" target="_blank" rel="noopener noreferrer">${e(item.label)} ↗</a>`).join("");
}
