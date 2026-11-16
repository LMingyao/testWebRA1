import { createPhotoPreloader } from "./images.js";
import { createPhotoStage } from "./photo-stage.js";

export function onSwipe(element, callback, signal) {
  let gesture;
  const options = { passive: true, signal };
  function cancel() { gesture = undefined; }
  element.addEventListener(
    "touchstart",
    (event) => {
      const button = event.target.closest?.("button");
      if (event.touches.length !== 1 || (button && !button.matches(".opening-image,.single-image"))) {
        cancel();
        return;
      }
      const touch = event.changedTouches[0];
      gesture = {
        id: touch.identifier, x: touch.clientX, y: touch.clientY,
        threshold: Math.max(36, Math.min(60, (element.clientWidth || 390) * .12)),
        horizontal: false,
      };
    },
    options,
  );
  element.addEventListener("touchmove", (event) => {
    if (!gesture || event.touches.length !== 1) return cancel();
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) return cancel();
    if (gesture.horizontal) return;
    const dx = Math.abs(touch.clientX - gesture.x);
    const dy = Math.abs(touch.clientY - gesture.y);
    if (Math.max(dx, dy) < 10) return;
    if (dy > dx * 1.2) return cancel();
    if (dx > dy * 1.35) gesture.horizontal = true;
  }, options);
  element.addEventListener("touchcancel", cancel, options);
  element.addEventListener(
    "touchend",
    (event) => {
      const active = gesture;
      cancel();
      if (!active || event.touches.length) return;
      const touch = event.changedTouches[0];
      if (touch.identifier !== active.id) return;
      const dx = touch.clientX - active.x;
      const dy = touch.clientY - active.y;
      if (Math.abs(dx) < active.threshold || Math.abs(dx) <= Math.abs(dy) * 1.35) return;
      // Finishing a swipe on the photo button must not also activate its tap action.
      if (event.cancelable) event.preventDefault();
      callback(dx < 0 ? 1 : -1);
    },
    { passive: false, signal },
  );
}

export function createPhotoViewer(dialog, onChange, onClose, onOpen) {
  const lifecycle = new AbortController();
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
    onOpen?.(photos[index].id);
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
  }, { signal: lifecycle.signal });
  dialog.addEventListener("click", (event) => {
    if (
      event.target === dialog ||
      event.target.classList.contains("viewer-stage")
    )
      dialog.close();
  }, { signal: lifecycle.signal });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      advance(event.key === "ArrowRight" ? 1 : -1);
    }
  }, { signal: lifecycle.signal });

  onSwipe(dialog.querySelector(".viewer-stage"), advance, lifecycle.signal);
  open.destroy = () => {
    lifecycle.abort();
    if (dialog.open) dialog.close();
    document.body.classList.remove("viewing");
    stage.destroy();
    preload.clear();
  };
  return open;
}
