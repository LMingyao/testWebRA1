export function applyPhotoBatch(data, ids, action, category) {
  if (action === "category" && !data.categories.some(item => item.id === category)) throw new Error("请选择有效的分类。");
  if (!["category", "show", "hide", "select", "unselect"].includes(action)) throw new Error("批量操作无效。");
  const chosen = new Set(ids);
  let count = 0;
  for (const photo of data.photos) {
    if (!chosen.has(photo.id)) continue;
    if (action === "category") photo.category = category;
    if (action === "show" || action === "hide") photo.published = action === "show";
    if (action === "select" || action === "unselect") photo.homeSelected = action === "select";
    count++;
  }
  return count;
}
