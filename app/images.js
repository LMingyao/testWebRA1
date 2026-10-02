import { escapeHTML as e } from "./shared.js";

export function createPhotoPreloader() {
  const images = [new Image(), new Image()];
  const preload = (photos, index, box) => {
    if (photos.length < 2 || navigator.connection?.saveData) return;
    for (const [i, direction] of [-1, 1].entries()) {
      const photo = photos[(index + direction + photos.length) % photos.length];
      const source = photoSource(photo, { ...box, pixelRatio: window.devicePixelRatio || 1 });
      if (i && source === images[0].getAttribute("src")) continue;
      images[i].fetchPriority = "low";
      if (images[i].getAttribute("src") !== source) images[i].src = source;
    }
  };
  preload.clear = () => images.forEach(image => image.removeAttribute("src"));
  return preload;
}

export function photoCandidates(photo) {
  const seen = new Set();
  return [[photo.thumbnail, 640], [photo.display, 1280], [photo.large, 1920]]
    .map(([file, size]) => ({ file, width: Math.round(photo.width * Math.min(1, size / Math.max(photo.width, photo.height))) }))
    .filter(candidate => {
      if (!candidate.file || seen.has(candidate.width)) return false;
      seen.add(candidate.width);
      return true;
    });
}

export function fittedPhotoWidth(photo, { width, height = Infinity }) {
  return Math.max(1, Math.min(width, height * photo.width / photo.height));
}

export function photoSource(photo, { width = 1320, height = Infinity, pixelRatio = 1 } = {}) {
  const candidates = photoCandidates(photo);
  const required = fittedPhotoWidth(photo, { width, height }) * pixelRatio;
  return (candidates.find(candidate => candidate.width >= required) || candidates.at(-1))?.file || photo.image;
}

export function photoImage(photo, {
  eager = false,
  sizes = "(max-width: 700px) calc(100vw - 40px), (max-width: 1100px) calc(100vw - 80px), min(1320px, calc(100vw - 112px))",
} = {}) {
  const candidates = photoCandidates(photo);
  const srcset = candidates.length
    ? `srcset="${candidates.map(candidate => `${e(candidate.file)} ${candidate.width}w`).join(", ")}" sizes="${e(sizes)}"`
    : "";
  return `<img src="${e(photo.display || photo.image)}" ${srcset} width="${photo.width}" height="${photo.height}" alt="${e(photo.alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" ${eager ? 'fetchpriority="high"' : ""}>`;
}
