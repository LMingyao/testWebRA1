import { reorderPhoto } from "../app/shared.js";

export function bindPhotoOrdering(editor, { getData, isBusy, onChange }) {
  let drag;
  const clear = () => {
    drag = undefined;
    editor.querySelectorAll(".drop-target,.is-dragging").forEach(card => card.classList.remove("drop-target", "is-dragging"));
  };
  function targetAt(event) {
    const card = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-card]");
    const photos = getData().photos;
    const source = photos.find(photo => photo.id === drag.id), target = photos.find(photo => photo.id === card?.dataset.card);
    return target && source !== target &&
      (source.placement || "gallery") === (target.placement || "gallery") ? card : undefined;
  }
  editor.addEventListener("pointerdown", event => {
    const handle = event.target.closest("[data-drag]");
    if (!handle || isBusy() || event.button !== 0 || event.isPrimary === false) return;
    drag = { id: handle.dataset.drag, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
    handle.setPointerCapture(event.pointerId);
  });
  editor.addEventListener("pointermove", event => {
    if (!drag || drag.pointerId !== event.pointerId || isBusy()) return;
    if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
    drag.active = true;
    event.preventDefault();
    editor.querySelector(`[data-card="${drag.id}"]`)?.classList.add("is-dragging");
    editor.querySelectorAll(".drop-target").forEach(card => card.classList.remove("drop-target"));
    targetAt(event)?.classList.add("drop-target");
  });
  editor.addEventListener("pointerup", event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const card = drag.active && !isBusy() ? targetAt(event) : undefined;
    if (card) {
      const bounds = card.getBoundingClientRect();
      if (reorderPhoto(getData(), drag.id, card.dataset.card, event.clientY > bounds.top + bounds.height / 2)) onChange();
    }
    clear();
  });
  editor.addEventListener("pointercancel", clear);
  editor.addEventListener("lostpointercapture", clear);
}
