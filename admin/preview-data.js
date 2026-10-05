import { validateContent } from "../app/shared.js";

// Validate logical paths before resolving them. The draft never leaves this tab.
export function previewContent(data, image, previews = new Map()) {
  const draft = structuredClone(validateContent(data));
  draft.site.aboutImage = previews.get(draft.site.aboutImage) || previews.get(draft.photos.find(photo => photo.image === draft.site.aboutImage)?.id) || image(draft.site.aboutImage);
  for (const photo of draft.photos) {
    for (const item of photo.renditions || []) item.path = previews.get(photo.id) || image(item.path);
    for (const key of ["image", "thumbnail", "display", "large"])
      if (photo[key]) photo[key] = previews.get(photo.id) || image(photo[key]);
  }
  return draft;
}
