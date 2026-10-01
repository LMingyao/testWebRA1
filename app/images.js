import { escapeHTML as e } from "./shared.js";

export function photoImage(photo, {
  eager = false,
  sizes = "(max-width: 700px) calc(100vw - 40px), (max-width: 1100px) calc(100vw - 80px), min(1320px, calc(100vw - 112px))",
} = {}) {
  const width = (size) =>
    Math.round(
      photo.width * Math.min(1, size / Math.max(photo.width, photo.height)),
    );
  const seen = new Set();
  const candidates = [
    [photo.thumbnail, 640],
    [photo.display, 1280],
    [photo.large, 1920],
  ].filter(([file, size]) => {
    const pixels = width(size);
    if (!file || seen.has(pixels)) return false;
    seen.add(pixels);
    return true;
  });
  const srcset = candidates.length
    ? `srcset="${candidates.map(([file, size]) => `${e(file)} ${width(size)}w`).join(", ")}" sizes="${e(sizes)}"`
    : "";
  return `<img src="${e(photo.display || photo.image)}" ${srcset} width="${photo.width}" height="${photo.height}" alt="${e(photo.alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" ${eager ? 'fetchpriority="high"' : ""}>`;
}

