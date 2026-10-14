import { escapeHTML as e } from "./shared.js";
import { siteSettings, gearItems } from "./config.js";

export function renderEditorial(main, content, page) {
  main.innerHTML = editorialHTML(content, page);
  const copy = main.querySelector?.(".copy-email");
  if (copy) bindEmailCopy(copy, main.querySelector(".contact-email-fallback"), siteSettings(content.site));
}
export function bindEmailCopy(copy, fallback, settings, clipboard = navigator.clipboard, timers = globalThis) {
  let timer, attempt = 0;
  copy.onclick = async () => {
    const current = ++attempt;
    timers.clearTimeout(timer);
    try {
      await clipboard.writeText(copy.dataset.email);
      if (current !== attempt || copy.isConnected === false) return;
      fallback.hidden = true;
      copy.textContent = settings.copiedEmailLabel;
    } catch {
      if (current !== attempt || copy.isConnected === false) return;
      fallback.hidden = false;
      copy.textContent = "Select email to copy";
    }
    timer = timers.setTimeout(() => {
      if (current === attempt && copy.isConnected !== false) copy.textContent = settings.copyEmailLabel;
    }, 2400);
  };
}
export function editorialHTML(content, page) {
  const s = siteSettings(content.site);
  const equipment = gearItems(s.gear);
  if (page === "about") {
    const paragraphs = s.about.split(/\n\s*\n/).filter(text => text.trim());
    return `<section class="editorial"><div class="editorial-heading"><p class="eyebrow">${e(s.aboutLabel)}</p>${s.aboutTitle.trim() ? `<h1>${e(s.aboutTitle)}</h1>` : `<h1 class="sr-only">${e(s.aboutLabel)} ${e(s.name)}</h1>`}</div><div class="about-grid"><img class="about-photo" src="${e(s.aboutImage)}" alt="${e(s.aboutImageAlt)}"><div class="about-copy"><p class="eyebrow">${e(s.location)}</p><div class="body-copy">${paragraphs.map(text => `<p>${e(text)}</p>`).join("")}</div>${equipment.length ? `<details class="gear"><summary>${e(s.gearLabel)}</summary><ul class="gear-list">${equipment.map(item => `<li>${e(item)}</li>`).join("")}</ul></details>` : ""}${s.showContact ? `<a class="text-link" href="contact.html">${e(s.contactLinkLabel)} <span aria-hidden="true">↗</span></a>` : ""}</div></div></section>`;
  } else {
    return `<section class="contact-page"><h1 class="sr-only">${e(s.contactLabel)} ${e(s.name)}</h1><p class="contact-purpose">${e(s.contactText)}</p><div class="contact-actions"><a class="email-link" href="mailto:${e(s.email)}"><span>${e(s.emailActionLabel)}</span><span class="contact-arrow" aria-hidden="true">↗</span></a><button type="button" class="copy-email" data-email="${e(s.email)}" aria-live="polite">${e(s.copyEmailLabel)}</button></div><p class="contact-email-fallback" hidden>${e(s.email)}</p><p class="contact-location">${e(s.location)}</p></section>`;
  }
}
