export const categoryPages = {
  aviation: "aviation.html", landscape: "landscape.html", portrait: "ptr.html",
  wildlife: "wildlife.html", motorsport: "motorsport.html",
};
export function categoryURL(id) {
  return id === "all" ? "index.html" : Object.hasOwn(categoryPages, id)
    ? categoryPages[id] : `index.html?category=${encodeURIComponent(id)}`;
}
export function categoryFromURL(url) {
  return url.searchParams.get("category") ||
    Object.entries(categoryPages).find(([, file]) => url.pathname.endsWith(`/${file}`))?.[0] || "all";
}
export function pageMetadata(content, page, category = "all") {
  const site = content.site;
  const collection = content.categories.find(item => item.id === category);
  const label = page === "about" ? "About" : page === "contact" ? "Contact"
    : collection?.label || "Selected work";
  const file = page === "about" ? "about_me.html" : page === "contact" ? "contact.html" : categoryURL(category);
  return {
    title: `${label} · ${site.name} Photography`,
    description: page === "about" ? site.about.replace(/\s+/g, " ").slice(0, 240)
      : page === "contact" ? `Contact ${site.name} for photography enquiries. ${site.location}.`
      : collection ? collection.description?.trim() || `${collection.label} photographs by ${site.name}, ${site.location}.`
      : site.description,
    canonical: new URL(file, "https://mingyaophoto.com/").href,
    image: "https://mingyaophoto.com/assets/social-card.png",
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
  ]) document.querySelector(selector).content = value;
}
