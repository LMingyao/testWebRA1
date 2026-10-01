import { escapeHTML as e, galleryPhotos } from "./shared.js";

export function photoImage(photo, eager = false, full = false) {
  const width = (size) =>
    Math.round(
      photo.width * Math.min(1, size / Math.max(photo.width, photo.height)),
    );
  const candidates = [
    [photo.thumbnail, 640],
    [photo.display, 1280],
    [photo.large, 1920],
  ].filter(
    ([file, size], index, array) =>
      file && (index === 0 || width(size) !== width(array[index - 1][1])),
  );
  const sizes = full
    ? "(max-width: 700px) calc(100vw - 36px), (max-width: 1100px) calc(100vw - 80px), min(1320px, calc(100vw - 144px))"
    : "(max-width: 700px) calc(100vw - 40px), (max-width: 1100px) calc((100vw - 112px) / 2), 550px";
  const srcset = candidates.length
    ? `srcset="${candidates.map(([file, size]) => `${e(file)} ${width(size)}w`).join(", ")}" sizes="${sizes}"`
    : "";
  return `<img src="${e(photo.display || photo.image)}" ${srcset} width="${photo.width}" height="${photo.height}" alt="${e(photo.alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" ${eager ? 'fetchpriority="high"' : ""}>`;
}

const dialog = document.querySelector(".lightbox");
let viewing = [],
  active = 0;
function showPhoto() {
  const photo = viewing[active];
  const image = dialog.querySelector("img");
  image.src = photo.large || photo.image;
  image.alt = photo.alt;
  dialog.querySelector(".lightbox-title").textContent = photo.title;
  dialog.querySelector(".lightbox-category").textContent = photo.categoryLabel;
  dialog.querySelector(".lightbox-count").textContent =
    `${String(active + 1).padStart(2, "0")} / ${String(viewing.length).padStart(2, "0")}`;
  dialog.querySelector(".lightbox-original").href = photo.image;
  dialog
    .querySelectorAll(".lightbox-prev,.lightbox-next")
    .forEach((button) => (button.disabled = viewing.length < 2));
}
function openPhoto(photos, index) {
  if (!photos[index]) return;
  viewing = photos;
  active = index;
  showPhoto();
  dialog.showModal();
  document.body.classList.add("viewing");
}
function advance(direction) {
  active = (active + direction + viewing.length) % viewing.length;
  showPhoto();
}
dialog.querySelector(".lightbox-close").onclick = () => dialog.close();
dialog.querySelector(".lightbox-prev").onclick = () => advance(-1);
dialog.querySelector(".lightbox-next").onclick = () => advance(1);
dialog.addEventListener("close", () =>
  document.body.classList.remove("viewing"),
);
dialog.addEventListener("click", (event) => {
  if (
    event.target === dialog ||
    event.target.classList.contains("viewer-stage")
  )
    dialog.close();
});
dialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    advance(event.key === "ArrowRight" ? 1 : -1);
  }
});
let viewerTouch;
dialog.addEventListener(
  "touchstart",
  (event) => {
    viewerTouch = event.changedTouches[0].clientX;
  },
  { passive: true },
);
dialog.addEventListener(
  "touchend",
  (event) => {
    const delta = event.changedTouches[0].clientX - viewerTouch;
    if (Math.abs(delta) > 65) advance(delta < 0 ? 1 : -1);
  },
  { passive: true },
);

function carousel(container, photos) {
  let current = 0,
    paused = matchMedia("(prefers-reduced-motion: reduce)").matches,
    isVisible = true;
  const frame = container.querySelector(".hero-image");
  function show(index) {
    current = (index + photos.length) % photos.length;
    frame.innerHTML = photoImage(photos[current], true, true);
    container.querySelector(".hero-title").textContent = photos[current].title;
    container.querySelector(".hero-counter").textContent =
      `${String(current + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;
    container
      .querySelectorAll("[data-slide]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(Number(button.dataset.slide) === current),
        ),
      );
  }
  function setPaused(value) {
    paused = value;
    const button = container.querySelector("[data-pause]");
    button.setAttribute(
      "aria-label",
      paused ? "Play slideshow" : "Pause slideshow",
    );
    button.textContent = paused ? "▶" : "Ⅱ";
  }
  show(0);
  setPaused(paused);
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-pause")) setPaused(!paused);
    else {
      setPaused(true);
      if (button.hasAttribute("data-slide")) show(Number(button.dataset.slide));
      else if (button.hasAttribute("data-previous")) show(current - 1);
      else if (button.hasAttribute("data-next")) show(current + 1);
    }
  });
  let start;
  frame.addEventListener(
    "touchstart",
    (event) => {
      start = event.changedTouches[0].clientX;
    },
    { passive: true },
  );
  frame.addEventListener(
    "touchend",
    (event) => {
      const delta = event.changedTouches[0].clientX - start;
      if (Math.abs(delta) > 55) {
        setPaused(true);
        show(current + (delta < 0 ? 1 : -1));
      }
    },
    { passive: true },
  );
  const observer = new IntersectionObserver(
    (entries) => {
      isVisible = entries[0].isIntersecting;
    },
    { threshold: 0.2 },
  );
  observer.observe(container);
  const timer = setInterval(() => {
    if (
      !paused &&
      isVisible &&
      !document.hidden &&
      !dialog.open &&
      !container.matches(":hover") &&
      !container.contains(document.activeElement)
    )
      show(current + 1);
  }, 6500);
  window.addEventListener(
    "pagehide",
    () => {
      clearInterval(timer);
      observer.disconnect();
    },
    { once: true },
  );
}

export function renderGallery(main, content, page) {
  const portrait = page === "portrait";
  const heroes = portrait
    ? []
    : content.photos
        .filter((p) => p.published && p.placement === "hero")
        .sort((a, b) => Number(b.featured) - Number(a.featured));
  const availableCategories = content.categories.filter(
    (category) => galleryPhotos(content, category.id).length,
  );
  const categoryName = (id) =>
    content.categories.find((c) => c.id === id)?.label || id;
  main.innerHTML = `${heroes.length ? `<section class="hero" aria-label="Featured photography slideshow" aria-roledescription="carousel"><div class="hero-image"></div><div class="hero-rail"><span class="hero-title"></span><div class="hero-dots" aria-label="Choose a slide">${heroes.map((p, i) => `<button data-slide="${i}" aria-label="Show slide ${i + 1}: ${e(p.title)}" aria-pressed="false"></button>`).join("")}</div><div class="hero-controls"><span class="hero-counter" aria-live="off"></span><button data-previous aria-label="Previous slide">←</button><button data-pause aria-label="Pause slideshow">Ⅱ</button><button data-next aria-label="Next slide">→</button></div></div></section>` : ""}
    <section id="collection" class="collection ${portrait ? "portrait-collection" : ""}"><header class="collection-heading"><div><p class="eyebrow">${portrait ? "PORTRAITS" : "SELECTED PHOTOGRAPHS"}</p><h1>${e(portrait ? "People, as they are." : content.site.intro)}</h1></div><span id="photo-count"></span></header>${portrait ? "" : `<div class="filters" aria-label="Photo categories">${[{ id: "all", label: "All work" }, ...availableCategories].map((c) => `<button data-filter="${e(c.id)}" aria-pressed="false">${e(c.label)}</button>`).join("")}</div>`}<div id="gallery" class="photo-grid"></div></section>`;
  let visible = [];
  function cards(filter = "all") {
    visible = galleryPhotos(content, filter).map((p) => ({
      ...p,
      categoryLabel: categoryName(p.category),
    }));
    main.querySelector("#photo-count").textContent =
      `${String(visible.length).padStart(2, "0")} photographs`;
    main.querySelector("#gallery").innerHTML = visible.length
      ? visible
          .map(
            (p, i) =>
              `<figure class="photo-card"><button data-photo="${i}" aria-label="View ${e(p.title)}">${photoImage(p, i < 2)}</button><figcaption><span>${e(p.title)}</span><small>${e(p.categoryLabel)}</small></figcaption></figure>`,
          )
          .join("")
      : '<p class="empty">A new collection is on its way.</p>';
    main
      .querySelectorAll("[data-filter]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.filter === filter),
        ),
      );
  }
  const initial = portrait
    ? "portrait"
    : new URLSearchParams(location.search).get("category") || "all";
  cards(
    portrait ||
      initial === "all" ||
      availableCategories.some((c) => c.id === initial)
      ? initial
      : "all",
  );
  main.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (button) {
      cards(button.dataset.filter);
      const url = new URL(location.href);
      if (button.dataset.filter === "all") url.searchParams.delete("category");
      else url.searchParams.set("category", button.dataset.filter);
      history.replaceState(null, "", url);
    }
    const photo = event.target.closest("[data-photo]");
    if (photo) openPhoto(visible, Number(photo.dataset.photo));
  });
  if (heroes.length) carousel(main.querySelector(".hero"), heroes);
}
