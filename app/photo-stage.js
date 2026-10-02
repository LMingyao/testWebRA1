import { photoImage, fittedPhotoWidth } from "./images.js";

// Single view and the dialog share loading, retry and fitted image sizing.
export function createPhotoStage(stage, host) {
  let photo, ready, image;
  const status = document.createElement("div");
  status.className = "stage-status";
  status.hidden = true;
  status.innerHTML = '<p role="status"></p><button type="button" hidden>Try again</button>';
  stage.append(status);
  const message = status.querySelector("p"), retry = status.querySelector("button");
  function box() { return { width: stage.clientWidth, height: stage.clientHeight }; }
  function resize() {
    if (!photo || !image || !stage.clientWidth || !stage.clientHeight) return;
    image.sizes = `${Math.ceil(fittedPhotoWidth(photo, box()))}px`;
    if (image.complete && image.naturalWidth) ready?.(box());
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  function show(next, onReady) {
    photo = next;
    ready = onReady;
    stage.classList.add("is-loading");
    stage.classList.remove("has-image-error");
    status.hidden = false;
    retry.hidden = true;
    message.textContent = "Loading photograph…";
    host.innerHTML = photoImage(photo, { eager: true, sizes: `${Math.ceil(fittedPhotoWidth(photo, box()))}px` });
    image = host.querySelector("img");
    const current = image;
    function loaded() {
      if (image !== current || !current.naturalWidth) return;
      stage.classList.remove("is-loading", "has-image-error");
      status.hidden = true;
      ready?.(box());
    }
    function failed() {
      if (image !== current) return;
      stage.classList.remove("is-loading");
      stage.classList.add("has-image-error");
      message.textContent = "This photograph couldn’t load.";
      retry.hidden = false;
    }
    current.addEventListener("load", loaded, { once: true });
    current.addEventListener("error", failed, { once: true });
    if (current.complete) current.naturalWidth ? loaded() : failed();
  }
  retry.onclick = () => {
    show(photo, ready);
    const target = host.matches("button") ? host : stage.closest("dialog")?.querySelector(".lightbox-close");
    target?.focus({ preventScroll: true });
  };
  function clear() {
    photo = image = ready = undefined;
    host.replaceChildren();
    status.hidden = true;
    stage.classList.remove("is-loading", "has-image-error");
  }
  return { show, clear, destroy() { observer.disconnect(); clear(); status.remove(); } };
}
