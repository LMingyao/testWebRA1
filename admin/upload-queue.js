// Failed originals stay in memory for a selective retry; prepared images use the draft store.
export function uploadItems(files, category, placement) {
  return Array.from(files, file => ({ key: crypto.randomUUID(), file, name: file.name, category, placement, status: "pending" }));
}
export async function processUploads(items, prepare, accept, changed = () => {}) {
  for (const item of items) {
    if (item.status === "done") continue;
    item.status = "processing"; delete item.error; changed(item);
    try {
      const prepared = await prepare(item.file, item.category, item.placement);
      await accept(prepared);
      item.id = prepared.photo.id; item.preview = prepared.preview; item.status = "done";
      delete item.file;
    } catch (error) {
      item.status = "failed"; item.error = error.message || "照片处理失败，请重试。";
    }
    changed(item);
  }
}
