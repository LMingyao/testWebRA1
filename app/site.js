import { escapeHTML as e, validateContent, currentYear } from "./shared.js";

const main = document.querySelector("main");
const page = document.body.dataset.page;
document
  .querySelectorAll("[data-logo-year]")
  .forEach((el) => (el.textContent = currentYear()));
const dialog = document.querySelector("dialog");
let content,
  visible = [],
  active = 0;
const categoryName = (id) =>
  content.categories.find((c) => c.id === id)?.label || id;
function image(photo, eager = false, full = false) {
  const width = (size) =>
    Math.round(
      photo.width * Math.min(1, size / Math.max(photo.width, photo.height)),
    );
  const candidates = [
    [photo.thumbnail, 640],
    [photo.display, 1280],
    [photo.large, 1920],
  ].filter(
    (item, index, array) =>
      index === 0 || width(item[1]) !== width(array[index - 1][1]),
  );
  const srcset =
    photo.thumbnail && photo.display && photo.large
      ? `srcset="${candidates.map(([file, size]) => `${e(file)} ${width(size)}w`).join(", ")}" sizes="${full ? "(max-width: 650px) calc(100vw - 36px), (max-width: 1000px) calc(100vw - 64px), min(1440px, calc(100vw - 112px))" : "(max-width: 650px) calc(100vw - 36px), (max-width: 1000px) 50vw, 33vw"}"`
      : "";
  return `<img src="${e(photo.display || photo.image)}" ${srcset} width="${photo.width}" height="${photo.height}" alt="${e(photo.alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" ${eager ? 'fetchpriority="high"' : ""}>`;
}
function cards(filter = "all") {
  visible = content.photos.filter(
    (p) => p.published && (filter === "all" || p.category === filter),
  );
  document.querySelector("#photo-count").textContent =
    `${String(visible.length).padStart(2, "0")} photographs`;
  document.querySelector("#gallery").innerHTML = visible.length
    ? visible
        .map(
          (p, i) =>
            `<figure class="photo-card"><button data-photo="${i}" aria-label="View ${e(p.title)}">${image(p, i < 3)}<span class="photo-open" aria-hidden="true">↗</span></button><figcaption><span>${e(p.title)}</span><small>${e(categoryName(p.category))}</small></figcaption></figure>`,
        )
        .join("")
    : '<p class="empty">A new collection is on its way. Come back soon.</p>';
  document
    .querySelectorAll("[data-filter]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.filter === filter)),
    );
}
function galleryPage() {
  const portrait = page === "portrait";
  const selected =
    content.photos.find(
      (p) =>
        p.published && p.featured && (!portrait || p.category === "portrait"),
    ) ||
    content.photos.find(
      (p) => p.published && (!portrait || p.category === "portrait"),
    );
  main.innerHTML = `<section class="intro"><div class="eyebrow"><span class="status-dot"></span> ${e(content.site.location)} <span class="intro-number">01 / ${portrait ? "PORTRAITS" : "SELECTED WORK"}</span></div><div class="intro-line"><h1>${portrait ? "People. Presence.<br><em>Personality.</em>" : "A different way<br>of <em>seeing.</em>"}</h1><div class="intro-note"><p>${e(portrait ? "A collection of portraits, capturing people as they are." : content.site.description)}</p><a href="#collection">Explore the collection <span>↓</span></a></div></div></section>${selected ? `<section class="featured"><button data-featured aria-label="View ${e(selected.title)}">${image(selected, true, true)}<span class="featured-label">IN FOCUS <span>↗</span></span></button><div class="featured-caption"><span>${e(selected.title)}</span><span>${e(categoryName(selected.category))} · MINGYAO LI</span></div></section>` : ""}<section id="collection" class="collection"><div class="collection-top"><h2>${portrait ? "Portrait collection" : "The collection"}<span>.</span></h2><span id="photo-count"></span></div><div class="collection-controls"><div class="filters" aria-label="Photo categories">${(portrait ? content.categories.filter((c) => c.id === "portrait") : [{ id: "all", label: "All work" }, ...content.categories]).map((c) => `<button data-filter="${e(c.id)}" aria-pressed="false">${e(c.label)}</button>`).join("")}</div><span class="collection-hint">A moment, made permanent.</span></div><div id="gallery" class="photo-grid"></div></section><section class="contact-strip"><p>Have something in mind?</p><a href="contact.html">Let’s make a picture. <span>↗</span></a></section>`;
  const initial = portrait
    ? "portrait"
    : new URLSearchParams(location.search).get("category") || "all";
  cards(
    initial === "all" || content.categories.some((c) => c.id === initial)
      ? initial
      : "all",
  );
  main.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      cards(filter.dataset.filter);
      const url = new URL(location.href);
      url.searchParams.set("category", filter.dataset.filter);
      history.replaceState(null, "", url);
    }
    const photo = event.target.closest("[data-photo]");
    if (photo) openPhoto(Number(photo.dataset.photo));
    if (event.target.closest("[data-featured]")) {
      const index = visible.findIndex((p) => p.id === selected.id);
      if (index < 0) cards(portrait ? "portrait" : "all");
      openPhoto(visible.findIndex((p) => p.id === selected.id));
    }
  });
}
function showPhoto() {
  const p = visible[active];
  const img = dialog.querySelector("img");
  img.src = p.large || p.image;
  img.alt = p.alt;
  dialog.querySelector(".lightbox-title").textContent = p.title;
  dialog.querySelector(".lightbox-count").textContent =
    `${active + 1} / ${visible.length}`;
}
function openPhoto(index) {
  if (index < 0) return;
  active = index;
  showPhoto();
  dialog.showModal();
  document.body.classList.add("viewing");
}
function advance(direction) {
  active = (active + direction + visible.length) % visible.length;
  showPhoto();
}
dialog.querySelector(".lightbox-close").onclick = () => dialog.close();
dialog.querySelector(".lightbox-prev").onclick = () => advance(-1);
dialog.querySelector(".lightbox-next").onclick = () => advance(1);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener("close", () =>
  document.body.classList.remove("viewing"),
);
dialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") advance(1);
  if (event.key === "ArrowLeft") advance(-1);
});
let touchStart;
dialog.addEventListener(
  "touchstart",
  (event) => {
    touchStart = event.changedTouches[0].clientX;
  },
  { passive: true },
);
dialog.addEventListener(
  "touchend",
  (event) => {
    const delta = event.changedTouches[0].clientX - touchStart;
    if (Math.abs(delta) > 65) advance(delta < 0 ? 1 : -1);
  },
  { passive: true },
);
function aboutPage() {
  const s = content.site;
  main.innerHTML = `<section class="editorial"><div class="eyebrow">02 / BEHIND THE LENS</div><div class="about-grid"><img class="about-photo" src="${e(s.aboutImage)}" alt="${e(s.name)}" width="1000" height="1250"><div class="about-copy"><p class="eyebrow">${e(s.location)}</p><h1>${e(s.aboutTitle)}</h1><p class="body-copy">${e(s.about)}</p><div class="gear"><h2>In my camera bag</h2><p>${e(s.gear)}</p></div><a class="text-link" href="contact.html">Let’s connect ↗</a></div></div></section>`;
}
function contactPage() {
  const s = content.site;
  main.innerHTML = `<section class="contact-page"><div class="eyebrow">03 / GET IN TOUCH</div><h1>Let’s start<br><em>a conversation.</em></h1><div class="contact-details"><p>For photography enquiries, collaborations,<br>or simply to say hello.</p><a class="email-link" href="mailto:${e(s.email)}">${e(s.email)} <span>↗</span></a></div><p class="contact-location"><span class="status-dot"></span> ${e(s.location)}</p></section>`;
}
try {
  const response = await fetch("content/gallery.json");
  if (!response.ok) throw new Error("Collection unavailable");
  content = validateContent(await response.json());
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
  if (page === "about") aboutPage();
  else if (page === "contact") contactPage();
  else galleryPage();
  const featured = main.querySelector(".featured");
  if (featured) featured.after(main.querySelector(".intro"));
  // Site intro is content-managed; the portrait heading remains collection-specific.
  if (page === "portfolio") {
    const words = content.site.intro.replace(/\.$/, "").split(" ");
    const end = words.splice(-1)[0];
    document.querySelector("h1").innerHTML =
      `${e(words.join(" "))} <br><em>${e(end)}.</em>`;
  }
} catch (error) {
  main.innerHTML =
    '<section class="error-state"><h1>The collection is taking a moment.</h1><p>Please refresh the page or try again later.</p><button onclick="location.reload()">Try again</button></section>';
  console.error(error);
}
document.querySelector(".menu-toggle").onclick = (event) => {
  const button = event.currentTarget;
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  document.querySelector("nav").classList.toggle("is-open", !expanded);
};
