export async function backendConfig() {
  const response = await fetch(new URL("../content/backend.json", import.meta.url), { cache: "no-cache", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Backend configuration unavailable.");
  const config = await response.json();
  for (const key of ["apiBase", "adminURL"]) {
    if (typeof config[key] !== "string") throw new Error("Invalid backend configuration.");
    if (config[key]) {
      const url = new URL(config[key]);
      const local = ["127.0.0.1", "localhost"].includes(url.hostname);
      if (url.username || url.password || url.search || url.hash ||
          !(url.protocol === "https:" || (url.protocol === "http:" && local)))
        throw new Error("Invalid backend URL.");
      if (key === "apiBase" && url.pathname !== "/") throw new Error("API base must be an origin.");
    }
  }
  return config;
}
export async function loadPublicContent() {
  const config = await backendConfig();
  const response = await fetch(config.apiBase
    ? `${config.apiBase.replace(/\/$/, "")}/api/content` : "content/gallery.json", { cache: "no-cache", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Collection unavailable");
  // Do not fall back to an old JSON snapshot when the cloud API fails: it could
  // republish a photograph that the owner has since hidden or removed.
  return response.json();
}
// Called only after validating the logical paths in the content document.
// Cloud uploads can display from the media branch without waiting for Pages.
export function contentForDisplay(data) {
  if (!data.mediaBase) return data;
  const base = new URL(data.mediaBase);
  if (base.username || base.password || base.search || base.hash || !base.pathname.endsWith("/") ||
      !(base.protocol === "https:" || (base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname))))
    throw new Error("Invalid media base URL.");
  const content = structuredClone(data);
  content.site.aboutImage = new URL(content.site.aboutImage, base).href;
  if (content.site.shareImage) content.site.shareImage = new URL(content.site.shareImage, base).href;
  for (const photo of content.photos)
    for (const key of ["image", "thumbnail", "display", "large"])
      if (photo[key]) photo[key] = new URL(photo[key], base).href;
  return content;
}
