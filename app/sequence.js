// Collection sequences are independent; the library remains the fallback order.
export function orderedPhotos(data, collection, photos = data.photos) {
  const stored = data.collections?.photoOrder?.[collection];
  const order = Array.isArray(stored) ? stored : [];
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...photos].sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length));
}
export function reorderVisible(data, ids, sourceId, targetId, after = false, collection = null) {
  const source = data.photos.find(p => p.id === sourceId), target = data.photos.find(p => p.id === targetId);
  if (!source || !target || source === target || (source.placement || 'gallery') !== (target.placement || 'gallery')) return false;
  const allowed = new Set(ids);
  const members = orderedPhotos(data, collection).filter(p => allowed.has(p.id) && (p.placement || 'gallery') === (source.placement || 'gallery'));
  if (!members.includes(source) || !members.includes(target)) return false;
  const reordered = members.filter(p => p !== source);
  reordered.splice(reordered.indexOf(target) + Number(after), 0, source);
  if (collection) {
    data.collections ??= {};
    data.collections.photoOrder ??= {};
    const full = orderedPhotos(data, collection), selected = new Set(members.map(p => p.id));
    let index = 0;
    data.collections.photoOrder[collection] = full.map(p => selected.has(p.id) ? reordered[index++].id : p.id);
  } else {
    const selected = new Set(members.map(p => p.id));
    let index = 0;
    data.photos = data.photos.map(p => selected.has(p.id) ? reordered[index++] : p);
  }
  return true;
}
export function moveVisible(data, ids, id, direction, collection = null) {
  if (![-1, 1].includes(direction)) return false;
  const source = data.photos.find(p => p.id === id);
  if (!source) return false;
  const allowed = new Set(ids);
  const members = orderedPhotos(data, collection).filter(p => allowed.has(p.id) && (p.placement || 'gallery') === (source.placement || 'gallery'));
  const index = members.findIndex(p => p.id === id), target = members[index + direction];
  return index >= 0 && target ? reorderVisible(data, ids, id, target.id, direction === 1, collection) : false;
}
export function photoComposition(data, collection, photo) {
  const layouts = data.collections?.photoLayout;
  const layout = layouts && Object.hasOwn(layouts, collection) ? layouts[collection] : null;
  return layout && Object.hasOwn(layout, photo.id) ? layout[photo.id] : photo;
}
export function setComposition(data, ids, presentation, group, collection = null) {
  for (const photo of data.photos.filter(p => ids.includes(p.id))) {
    if (collection) {
      data.collections ??= {}; data.collections.photoLayout ??= {};
      if (!Object.hasOwn(data.collections.photoLayout, collection)) data.collections.photoLayout[collection] = {};
      data.collections.photoLayout[collection][photo.id] = {presentation, group};
    } else Object.assign(photo, {presentation, group});
  }
}
