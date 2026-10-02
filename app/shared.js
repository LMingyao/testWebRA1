export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const currentYear = () =>
  new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date());
// The same file references are checked by the build and both storage adapters.
export function contentImagePaths(data) {
  return new Set([
    data.site.aboutImage,
    ...data.photos.flatMap((photo) =>
      [photo.image, photo.thumbnail, photo.display, photo.large].filter(Boolean),
    ),
  ]);
}
// One navigation choice controls the opening panoramas and the photo sequence.
export function workPhotos(data, category = "all") {
  const photos = data.photos.filter(
    (photo) =>
      photo.published && (category === "all" ? photo.homeSelected === true : photo.category === category),
  );
  return [
    ...photos
      .filter((photo) => photo.placement === "hero")
      .sort((a, b) => Number(b.featured) - Number(a.featured)),
    ...photos.filter((photo) => photo.placement !== "hero"),
  ];
}
export function movePhotoWithinPlacement(data, id, direction) {
  const index = data.photos.findIndex((photo) => photo.id === id);
  if (index < 0 || ![-1, 1].includes(direction)) return false;
  const placement = data.photos[index].placement || "gallery";
  const positions = data.photos
    .map((photo, position) => ({ photo, position }))
    .filter((item) => (item.photo.placement || "gallery") === placement)
    .map((item) => item.position);
  const next = positions[positions.indexOf(index) + direction];
  if (next === undefined) return false;
  [data.photos[index], data.photos[next]] = [
    data.photos[next],
    data.photos[index],
  ];
  return true;
}
// Reorder only matching placement slots; unrelated hero/gallery positions stay put.
export function reorderPhoto(data, id, targetId, after = false) {
  const source = data.photos.find(photo => photo.id === id);
  const target = data.photos.find(photo => photo.id === targetId);
  if (!source || !target || source === target ||
      (source.placement || "gallery") !== (target.placement || "gallery")) return false;
  const positions = data.photos.flatMap((photo, index) =>
    (photo.placement || "gallery") === (source.placement || "gallery") ? [index] : []);
  const members = positions.map(index => data.photos[index]).filter(photo => photo !== source);
  members.splice(members.indexOf(target) + Number(after), 0, source);
  positions.forEach((index, i) => { data.photos[index] = members[i]; });
  return true;
}
export function safeImage(value) {
  return (
    typeof value === "string" &&
    /^(assets|media)\/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp)$/i.test(value) &&
    !value.includes("..")
  );
}
export function safeURL(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
export function validateContent(data) {
  if (
    !data ||
    data.version !== 1 ||
    !data.site ||
    !Array.isArray(data.photos) ||
    !Array.isArray(data.categories)
  )
    throw new Error("Invalid gallery format.");
  for (const key of [
    "name",
    "tagline",
    "location",
    "description",
    "email",
    "aboutTitle",
    "about",
    "aboutImage",
    "gear",
  ]) {
    if (typeof data.site[key] !== "string" || data.site[key].length > 12000)
      throw new Error(`Invalid site field: ${key}`);
  }
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.site.email) ||
    !safeImage(data.site.aboutImage)
  )
    throw new Error("Check your email and about image.");
  if (
    !Array.isArray(data.site.socials) ||
    data.site.socials.some(
      (s) => typeof s.label !== "string" || !safeURL(s.url),
    )
  )
    throw new Error("Social links must use HTTPS.");
  const categories = new Set();
  for (const category of data.categories) {
    if (category.description !== undefined &&
        (typeof category.description !== "string" || category.description.length > 400))
      throw new Error("Category descriptions must be up to 400 characters.");
    if (
      !/^[a-z0-9-]+$/.test(category.id) ||
      category.id === "all" ||
      categories.has(category.id) ||
      typeof category.label !== "string" ||
      !category.label.trim()
    )
      throw new Error("Category IDs must be unique lowercase names.");
    categories.add(category.id);
  }
  const ids = new Set();
  for (const photo of data.photos) {
    if (!/^[a-z0-9-]+$/.test(photo.id) || ids.has(photo.id))
      throw new Error("Photo IDs must be unique.");
    ids.add(photo.id);
    if (!categories.has(photo.category))
      throw new Error(`Unknown category: ${photo.category}`);
    if (
      typeof photo.title !== "string" ||
      !photo.title.trim() ||
      typeof photo.alt !== "string" ||
      !photo.alt.trim()
    )
      throw new Error("Every photo needs a title and alternative text.");
    if (
      !safeImage(photo.image) ||
      ["thumbnail", "display", "large"].some(
        (key) => photo[key] && !safeImage(photo[key]),
      )
    )
      throw new Error("Invalid photo path.");
    if (
      !Number.isFinite(photo.width) ||
      !Number.isFinite(photo.height) ||
      photo.width < 1 ||
      photo.height < 1
    )
      throw new Error("Invalid photo dimensions.");
    if (
      typeof photo.published !== "boolean" ||
      typeof photo.featured !== "boolean"
    )
      throw new Error("Invalid photo visibility.");
    if (
      photo.placement !== undefined &&
      !["gallery", "hero"].includes(photo.placement)
    )
      throw new Error("Photo placement must be gallery or hero.");
    if (photo.homeSelected !== undefined && typeof photo.homeSelected !== "boolean")
      throw new Error("Homepage selection must be a boolean.");
    if (photo.presentation !== undefined && !["auto", "solo"].includes(photo.presentation))
      throw new Error("Photo presentation must be auto or solo.");
    if (photo.group !== undefined && (typeof photo.group !== "string" || photo.group.length > 80))
      throw new Error("Photo group must be a name of up to 80 characters.");
  }
  return data;
}
