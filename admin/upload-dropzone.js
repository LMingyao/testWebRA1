import { escapeHTML as e } from "../app/shared.js";
import { studioIcon } from "./ui.js";

export function validateUploadBatch(files) {
  if (!files.length) throw new Error("请拖入照片文件；暂不支持文件夹。");
  if (files.length > 20) throw new Error("每批最多上传 20 张照片，请分批添加。");
}

export function uploadPanel({ open, categories, category, placement, message, results }) {
  return `<section id="upload-panel" class="upload-panel" aria-labelledby="upload-title" ${open ? "" : "hidden"}>
    <div class="upload-heading"><div><h2 id="upload-title">添加照片</h2><p class="hint">先加入草稿，检查作品后再保存。</p></div><button id="close-upload" aria-label="收起上传区域">${studioIcon("close")}</button></div>
    <div class="upload-options"><label>上传到分类<select id="upload-category" aria-label="上传到分类">${categories.map(item => `<option value="${e(item.id)}" ${item.id === category ? "selected" : ""}>${e(item.label)}</option>`).join("")}</select></label><label>展示区域<select id="upload-placement" aria-label="展示区域"><option value="gallery" ${placement === "gallery" ? "selected" : ""}>作品画廊</option><option value="hero" ${placement === "hero" ? "selected" : ""}>顶部轮播</option></select></label></div>
    <div id="upload-dropzone" class="upload-dropzone" role="region" aria-label="照片拖放区域">${studioIcon("upload")}<strong>把照片拖到这里</strong><span>支持多张照片一起拖入，或</span><button id="browse-upload" class="secondary">选择文件</button><small>JPG ≤ 100 MB · PNG / WebP ≤ 25 MB · 每批最多 20 张</small></div>
    <p class="hint">保存前等比例缩图：作品画廊最长边 3072 像素，顶部轮播 4096 像素。小图不放大，缩图后无损编码；原图不上传。原图支持最多 1.2 亿像素，最长边 30000 像素。</p>
    <p id="upload-status" class="upload-status" role="status" aria-live="polite">${e(message || "新照片默认隐藏，不会自动发布到网站。")}</p>
    ${results.length ? `<div class="upload-results">${results.map(item => `<div class="upload-result" data-status="${e(item.status || "done")}">${item.preview ? `<img src="${e(item.preview)}" alt="">` : `<div class="upload-placeholder" aria-hidden="true">${studioIcon(item.status === "failed" ? "close" : "upload")}</div>`}<span>${e(item.name)}</span><small>${item.status === "failed" ? e(item.error) : item.status === "processing" ? "正在处理…" : item.status === "pending" ? "等待处理" : "已加入草稿"}</small>${item.status === "failed" ? `<button class="secondary" data-retry-upload="${e(item.key)}">重试此照片</button>` : ""}</div>`).join("")}${results.some(item => item.status === "failed") ? '<div class="upload-retry"><button id="retry-failed-uploads" class="secondary">只重试失败照片</button><small>失败原图仅保留在本次页面；刷新后请重新添加失败文件。已处理照片可通过草稿恢复。</small></div>' : ""}</div>` : ""}
  </section>`;
}

export function isFileTransfer(transfer) {
  return Array.from(transfer?.types || []).includes("Files");
}

// Listen at document level to stop external files navigating away from unsaved work.
// Internal photo ordering uses pointer events and is unaffected.
export function bindUploadDropzone(root, { getZone, isBusy, onFiles, onError }) {
  let depth = 0;
  const clear = () => { depth = 0; getZone()?.classList.remove("is-over"); };
  const inside = event => {
    const zone = getZone();
    return zone && !zone.closest("[hidden]") && zone.contains(event.target);
  };
  root.addEventListener("dragenter", event => {
    if (!isFileTransfer(event.dataTransfer) || !inside(event) || isBusy()) return;
    event.preventDefault(); depth++;
    getZone().classList.add("is-over");
  });
  root.addEventListener("dragleave", event => {
    if (!inside(event)) return;
    if (--depth <= 0) clear();
  });
  root.addEventListener("dragover", event => {
    if (!isFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = inside(event) && !isBusy() ? "copy" : "none";
  });
  root.addEventListener("drop", event => {
    if (!isFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    const accepted = inside(event) && !isBusy();
    clear();
    if (!accepted) return;
    const items = Array.from(event.dataTransfer.items || []);
    if (items.some(item => item.webkitGetAsEntry?.()?.isDirectory)) {
      onError("请拖入照片文件；暂不支持文件夹。"); return;
    }
    onFiles(Array.from(event.dataTransfer.files || []));
  });
  root.addEventListener("dragend", clear);
}
