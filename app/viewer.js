import { createPhotoPreloader } from "./images.js";

export function onSwipe(element, callback) {
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

export function createPhotoViewer(dialog, onChange, onClose) {
  const preload = createPhotoPreloader();
  let viewing = [],
    active = 0;
  function showPhoto() {
    const photo = viewing[active];
    onChange(photo.id);
    const image = dialog.querySelector("img");
    image.src = photo.large || photo.image;
    image.alt = photo.alt;
    preload(viewing, active);
    dialog.setAttribute("aria-label", `Photograph: ${photo.alt}`);
    dialog.querySelector(".lightbox-original").href = photo.image;
    dialog
      .querySelectorAll(".lightbox-prev,.lightbox-next")
      .forEach((button) => (button.disabled = viewing.length < 2));
  }
  function open(photos, index) {
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
  dialog.addEventListener("close", () => {
    document.body.classList.remove("viewing");
    onClose?.();
  });
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

  onSwipe(dialog, advance);
  return open;
}
