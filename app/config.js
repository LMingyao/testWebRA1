// Optional settings keep existing version-1 documents compatible.
export function siteSettings(site) {
  return {
    brandName: "MINGYAO", brandTitle: site.tagline || "Photography",
    workLabel: "Work", aboutLabel: "About", contactLabel: "Contact",
    contactText: "Photography enquiries & collaborations",
    contactLinkLabel: "Get in touch", gearLabel: "Camera & lenses",
    aboutImageAlt: site.name, footerText: "All rights reserved.",
    showAbout: true, showContact: true,
    ...site,
  };
}
export function gearItems(gear) {
  return Array.isArray(gear) ? [...gear] : (gear || "").split(/\s*·\s*|,\s*|\s+\/\s+/).map(item => item.trim()).filter(Boolean);
}
export function collections(data, { includeHidden = false } = {}) {
  const selected = { id: "all", label: "Selected work", description: data.site.description,
    visible: true, ...data.collections?.selected };
  const items = [selected, ...data.categories];
  const order = data.collections?.order || items.map(item => item.id);
  const rank = id => { const index = order.indexOf(id); return index < 0 ? order.length : index; };
  return items.filter(item => includeHidden || item.visible !== false)
    .sort((a, b) => rank(a.id) - rank(b.id));
}
export function defaultCollection(data) {
  const visible = collections(data);
  return visible.find(item => item.id === data.collections?.default)?.id || visible[0]?.id || "all";
}
export function resolveCollection(data, requested) {
  return collections(data).some(item => item.id === requested) ? requested : defaultCollection(data);
}
export function editableCollections(data) {
  data.collections ??= {};
  data.collections.selected ??= { label: "Selected work", visible: true };
  data.collections.order = collections(data, { includeHidden: true }).map(item => item.id);
  data.collections.default ??= "all";
  data.collections.defaultView ??= "multi";
  return data.collections;
}
