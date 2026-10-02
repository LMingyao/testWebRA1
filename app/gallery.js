import { escapeHTML as e, workPhotos } from "./shared.js";
import { photoRows } from "./layout.js";
import { photoImage } from "./images.js";
import { createPhotoViewer, onSwipe } from "./viewer.js";

export function createGallery(main, controls, content) {
  let layoutObserver, selectedPhotoId, viewerChanged, viewMode = "multi";
  const openPhoto = createPhotoViewer(document.querySelector(".lightbox"), id => {
    selectedPhotoId = id;
    viewerChanged?.(id);
  });
  return function renderGallery(category = "all") {
    layoutObserver?.disconnect();
    const sequence = workPhotos(content, category);
    const panoramas = sequence.filter((photo) => photo.placement === "hero");
    const photographs = sequence.filter((photo) => photo.placement !== "hero");
    const label =
      content.categories.find((item) => item.id === category)?.label ||
      "Selected work";
    let current = 0;
    let singleCurrent = sequence.findIndex(photo => photo.id === selectedPhotoId);
    if (singleCurrent < 0) singleCurrent = photographs.length ? panoramas.length : 0;
    selectedPhotoId = sequence[singleCurrent]?.id;
    const rememberedPanorama = panoramas.findIndex(photo => photo.id === selectedPhotoId);
    if (rememberedPanorama >= 0) current = rememberedPanorama;
    const viewControls = `<div class="view-controls" role="group" aria-label="Photo layout"><button data-view="single" aria-pressed="${viewMode === "single"}">Single view</button><button data-view="multi" aria-pressed="${viewMode === "multi"}">Multi view</button></div>`;
    const multi = `${panoramas.length ? `<div class="work-opening"><button class="opening-image" aria-label="Open panorama"></button>${panoramas.length > 1 ? '<div class="opening-controls"><button class="opening-previous" aria-label="Previous panorama">←</button><button class="opening-next" aria-label="Next panorama">→</button></div>' : ""}</div>` : ""}${photographs.length ? '<div class="photo-sheet"></div>' : ""}`;
    const single = `<div class="single-stage"><button class="single-image" aria-label="Open photograph"></button></div><div class="single-controls"><button class="single-previous" aria-label="Previous photograph" ${sequence.length < 2 ? "disabled" : ""}>←</button><button class="single-next" aria-label="Next photograph" ${sequence.length < 2 ? "disabled" : ""}>→</button></div>`;
    controls.innerHTML = viewControls;
    main.innerHTML = `<section class="work-gallery" aria-label="${e(label)}"><h1 class="sr-only">${e(label)}</h1>${sequence.length ? viewMode === "multi" ? multi : single : '<p class="empty">New photographs will be added soon.</p>'}</section>`;
    function changeView(event) {
      const view = event.target.closest("[data-view]");
      if (!view || viewMode === view.dataset.view) return;
      viewMode = view.dataset.view;
      renderGallery(category);
      controls.querySelector(`[data-view="${viewMode}"]`).focus({ preventScroll: true });
    }
    controls.onclick = changeView;
    const sheet = main.querySelector(".photo-sheet");
    let layoutWidth;
    function arrangePhotos() {
      const width = Math.round(sheet.clientWidth);
      if (!width || width === layoutWidth) return;
      layoutWidth = width;
      const focused = sheet.contains(document.activeElement)
        ? document.activeElement.closest("[data-photo]")?.dataset.photo : undefined;
      const gap = parseFloat(getComputedStyle(sheet).rowGap);
      const targetHeight = category === "portrait" ? 440 : 350;
      let index = 0;
      sheet.innerHTML = photoRows(photographs, { width, gap, targetHeight }).map(row => {
        const ratioSum = row.photos.reduce((sum, photo) => sum + photo.width / photo.height, 0);
        return `<div class="photo-row" style="grid-template-columns:${row.photos.map(photo => `${photo.width / photo.height / ratioSum * 100}fr`).join(" ")};width:${Math.min(100, row.width / width * 100)}%">${row.photos.map(photo => {
          const i = index++;
          return `<figure class="photo-card"><button data-photo="${panoramas.length + i}" aria-label="View ${e(photo.alt)}">${photoImage(photo, { eager: i < 2 && !panoramas.length, sizes: `${Math.ceil(row.height * photo.width / photo.height)}px` })}</button></figure>`;
        }).join("")}</div>`;
      }).join("");
      if (focused !== undefined)
        sheet.querySelector(`[data-photo="${focused}"]`)?.focus({ preventScroll: true });
    }
    if (sheet) {
      arrangePhotos();
      layoutObserver = new ResizeObserver(arrangePhotos);
      layoutObserver.observe(sheet);
    }
    const opening = main.querySelector(".work-opening");
    function showPanorama(index, remember = false) {
      current = (index + panoramas.length) % panoramas.length;
      const image = opening.querySelector(".opening-image");
      image.innerHTML = photoImage(panoramas[current], { eager: true });
      image.setAttribute("aria-label", `View ${panoramas[current].alt}`);
      if (remember) selectedPhotoId = panoramas[current].id;
    }
    if (opening) {
      showPanorama(current);
      onSwipe(opening, (direction) => showPanorama(current + direction, true));
      opening.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          showPanorama(current + (event.key === "ArrowRight" ? 1 : -1), true);
        }
      });
    }
    const singleStage = main.querySelector(".single-stage");
    function showSingle(index) {
      singleCurrent = (index + sequence.length) % sequence.length;
      const photo = sequence[singleCurrent];
      selectedPhotoId = photo.id;
      const button = singleStage.querySelector(".single-image");
      button.innerHTML = photoImage(photo, { eager: true });
      button.dataset.photo = singleCurrent;
      button.setAttribute("aria-label", `View ${photo.alt}`);
    }
    if (singleStage) {
      showSingle(singleCurrent);
      onSwipe(singleStage, direction => showSingle(singleCurrent + direction));
    }
    viewerChanged = id => {
      if (singleStage) showSingle(sequence.findIndex(photo => photo.id === id));
    };
    main.onkeydown = event => {
      if (singleStage && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        showSingle(singleCurrent + (event.key === "ArrowRight" ? 1 : -1));
      }
    };
    main.onclick = (event) => {
      const photo = event.target.closest("[data-photo]");
      if (photo) openPhoto(sequence, Number(photo.dataset.photo));
      if (event.target.closest(".opening-image")) openPhoto(sequence, current);
      if (event.target.closest(".opening-previous")) showPanorama(current - 1, true);
      if (event.target.closest(".opening-next")) showPanorama(current + 1, true);
      if (event.target.closest(".single-previous")) showSingle(singleCurrent - 1);
      if (event.target.closest(".single-next")) showSingle(singleCurrent + 1);
    };
  };
}
