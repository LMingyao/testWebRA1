import { escapeHTML as e } from "./shared.js";

export function renderEditorial(main, content, page) {
  const s = content.site;
  if (page === "about") {
    const paragraphs = s.about.split(/\n\s*\n/).filter(text => text.trim());
    main.innerHTML = `<section class="editorial"><div class="editorial-heading"><p class="eyebrow">ABOUT</p><h1>${e(s.aboutTitle)}</h1></div><div class="about-grid"><img class="about-photo" src="${e(s.aboutImage)}" alt="${e(s.name)}"><div class="about-copy"><p class="eyebrow">${e(s.location)}</p><div class="body-copy">${paragraphs.map(text => `<p>${e(text)}</p>`).join("")}</div>${s.gear.trim() ? `<details class="gear"><summary>Camera &amp; lenses</summary><p>${e(s.gear)}</p></details>` : ""}<a class="text-link" href="contact.html">Get in touch <span aria-hidden="true">↗</span></a></div></div></section>`;
  } else {
    main.innerHTML = `<section class="contact-page"><p class="eyebrow">CONTACT</p><h1 class="sr-only">Contact ${e(s.name)}</h1><div class="contact-details"><a class="email-link" href="mailto:${e(s.email)}">${e(s.email)} <span aria-hidden="true">↗</span></a><p>Photography enquiries &amp; collaborations</p></div><p class="contact-location">${e(s.name)}<br>${e(s.location)}</p></section>`;
  }
}
