import { createPhotoPreloader } from "./images.js";
import { createPhotoStage } from "./photo-stage.js";

export function onSwipe(element, callback) {
  let start;
  element.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) { start = undefined; return; }
      const touch = event.changedTouches[0];
      start = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );
  element.addEventListener("touchcancel", () => { start = undefined; }, { passive: true });
  element.addEventListener(
    "touchend",
    (event) => {
      if (!start || event.touches.length) { start = undefined; return; }
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
  const stage = createPhotoStage(dialog.querySelector(".viewer-stage"), dialog.querySelector(".viewer-image"));
  let viewing = [],
    active = 0;
  function showPhoto() {
    const photo = viewing[active];
    onChange(photo.id);
    stage.show(photo, box => preload(viewing, active, box));
    dialog.setAttribute("aria-label", `Photograph: ${photo.alt}`);
    dialog
      .querySelectorAll(".lightbox-prev,.lightbox-next")
      .forEach((button) => (button.disabled = viewing.length < 2));
  }
  function open(photos, index) {
    if (!photos[index]) return;
    viewing = photos;
    active = index;
    dialog.showModal();
    document.body.classList.add("viewing");
    showPhoto();
  }
  function advance(direction) {
    active = (active + direction + viewing.length) % viewing.length;
    showPhoto();
  }
  dialog.querySelector(".lightbox-close").onclick = () => dialog.close();
  dialog.querySelector(".lightbox-prev").onclick = () => advance(-1);
  dialog.querySelector(".lightbox-next").onclick = () => advance(1);
  dialog.addEventListener("close", () => {
    stage.clear();
    preload.clear();
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
