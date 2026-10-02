import { validateContent } from "../app/shared.js";

// Validate logical paths before resolving them. The draft never leaves this tab.
export function previewContent(data, image, previews = new Map()) {
  const draft = structuredClone(validateContent(data));
  draft.site.aboutImage = image(draft.site.aboutImage);
  for (const photo of draft.photos) {
    for (const key of ["image", "thumbnail", "display", "large"])
      if (photo[key]) photo[key] = previews.get(photo.id) || image(photo[key]);
  }
  return draft;
}
