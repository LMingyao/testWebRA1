export function arrowIcon(direction) {
  return `<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${direction < 0 ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"}"/></svg>`;
}
