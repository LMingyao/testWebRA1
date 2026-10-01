import { escapeHTML as e, workPhotos } from "./shared.js";

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
    ? "(max-width: 700px) calc(100vw - 40px), min(1320px, calc(100vw - 112px))"
    : "(max-width: 700px) calc(100vw - 40px), (max-width: 1100px) calc((100vw - 112px) / 2), 644px";
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
  dialog.setAttribute("aria-label", `Photograph: ${photo.alt}`);
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
function swipe(element, callback) {
  let start;
  element.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      start = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );
  element.addEventListener(
    "touchend",
    (event) => {
      if (!start) return;
      const touch = event.changedTouches[0],
        dx = touch.clientX - start.x,
        dy = touch.clientY - start.y;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5)
        callback(dx < 0 ? 1 : -1);
      start = undefined;
    },
    { passive: true },
  );
}
swipe(dialog, advance);

export function renderGallery(main, content, category = "all") {
  const sequence = workPhotos(content, category);
  const panoramas = sequence.filter((photo) => photo.placement === "hero");
  const photographs = sequence.filter((photo) => photo.placement !== "hero");
  const label =
    content.categories.find((item) => item.id === category)?.label ||
    "Selected work";
  let current = 0;
  main.innerHTML = `<section class="work-gallery" aria-label="${e(label)}"><h1 class="sr-only">${e(label)}</h1>${panoramas.length ? `<div class="work-opening"><button class="opening-image" aria-label="Open panorama"></button>${panoramas.length > 1 ? '<button class="opening-previous" aria-label="Previous panorama">←</button><button class="opening-next" aria-label="Next panorama">→</button>' : ""}</div>` : ""}${photographs.map((photo, i) => `<figure class="photo-card ${photo.width / photo.height > 2.1 ? "photo-wide" : ""}"><button data-photo="${panoramas.length + i}" aria-label="View ${e(photo.alt)}">${photoImage(photo, i < 2 && !panoramas.length, photo.width / photo.height > 2.1)}</button></figure>`).join("")}${sequence.length ? "" : '<p class="empty">New photographs will be added soon.</p>'}</section>`;
  const opening = main.querySelector(".work-opening");
  function showPanorama(index) {
    current = (index + panoramas.length) % panoramas.length;
    const image = opening.querySelector(".opening-image");
    image.innerHTML = photoImage(panoramas[current], true, true);
    image.setAttribute("aria-label", `View ${panoramas[current].alt}`);
  }
  if (opening) {
    showPanorama(0);
    swipe(opening, (direction) => showPanorama(current + direction));
    opening.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        showPanorama(current + (event.key === "ArrowRight" ? 1 : -1));
      }
    });
  }
  main.onclick = (event) => {
    const photo = event.target.closest("[data-photo]");
    if (photo) openPhoto(sequence, Number(photo.dataset.photo));
    if (event.target.closest(".opening-image")) openPhoto(sequence, current);
    if (event.target.closest(".opening-previous")) showPanorama(current - 1);
    if (event.target.closest(".opening-next")) showPanorama(current + 1);
  };
}
