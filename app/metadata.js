import { collections, defaultCollection, siteSettings } from "./config.js";
export const categoryPages = {
  aviation: "aviation.html", landscape: "landscape.html", portrait: "ptr.html",
  wildlife: "wildlife.html", motorsport: "motorsport.html",
};
export function categoryURL(id, content) {
  return id === "all" ? (content && defaultCollection(content) !== "all" ? "selected.html" : "index.html") : Object.hasOwn(categoryPages, id)
    ? categoryPages[id] : `collection-${encodeURIComponent(id)}.html`;
}
export function categoryFromURL(url, content) {
  return url.searchParams.get("category") || (url.pathname.endsWith("/selected.html") ? "all" : null) ||
    url.pathname.match(/\/collection-([a-z0-9-]+)\.html$/)?.[1] ||
    Object.entries(categoryPages).find(([, file]) => url.pathname.endsWith(`/${file}`))?.[0] || (content ? defaultCollection(content) : "all");
}
export function pageMetadata(content, page, category = "all") {
  const site = siteSettings(content.site);
  const collection = collections(content, { includeHidden: true }).find(item => item.id === category);
  const label = page === "about" ? site.aboutLabel : page === "contact" ? site.contactLabel
    : collection?.label || "Selected work";
  const file = page === "about" ? "about_me.html" : page === "contact" ? "contact.html" : categoryURL(category, content);
  return {
    title: `${label} · ${site.name} ${site.brandTitle}`,
    description: page === "about" ? site.about.replace(/\s+/g, " ").slice(0, 240)
      : page === "contact" ? `Contact ${site.name} for photography enquiries. ${site.location}.`
      : collection ? collection.description?.trim() || `${collection.label} photographs by ${site.name}, ${site.location}.`
      : site.description,
    canonical: new URL(file, "https://mingyaophoto.com/").href,
    image: site.shareImage ? new URL(site.shareImage, "https://mingyaophoto.com/").href : "https://mingyaophoto.com/assets/social-card.png",
  };
}
export function applyMetadata(metadata) {
  document.title = metadata.title;
  document.querySelector('link[rel="canonical"]').href = metadata.canonical;
  for (const [selector, value] of [
    ['meta[name="description"]', metadata.description],
    ['meta[property="og:title"]', metadata.title],
    ['meta[property="og:description"]', metadata.description],
    ['meta[property="og:url"]', metadata.canonical],
    ['meta[name="twitter:title"]', metadata.title],
    ['meta[name="twitter:description"]', metadata.description],
    ['meta[property="og:image"]', metadata.image],
    ['meta[name="twitter:image"]', metadata.image],
  ]) document.querySelector(selector).content = value;
}
