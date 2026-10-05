// Move only enough to expose a changed photograph. Oversized images align at the top.
export function photographScrollY(rect, scrollY, viewportHeight, margin = 24) {
  if (rect.top >= margin && rect.bottom <= viewportHeight - margin) return scrollY;
  if (rect.top < margin || rect.bottom - rect.top > viewportHeight - margin * 2)
    return Math.max(0, scrollY + rect.top - margin);
  return Math.max(0, scrollY + rect.bottom - viewportHeight + margin);
}
