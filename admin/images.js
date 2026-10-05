import {validateSourceFile} from "../app/media-policy.js";

// A worker per source releases its decoder and WASM memory when done.
export async function preparePhoto(file, category, placement = "gallery") {
  validateSourceFile(file);
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined")
    throw new Error("当前浏览器不支持后台缩图，请使用新版 Chrome 或 Edge。");
  const worker = new Worker(new URL("./image-worker.js", import.meta.url), {type: "module"});
  try {
    const prepared = await new Promise((resolve, reject) => {
      worker.onmessage = ({data}) => data.error ? reject(new Error(data.error)) : resolve(data);
      worker.onerror = () => reject(new Error("图片处理失败，请检查照片格式并使用新版 Chrome 或 Edge。"));
      worker.postMessage({file, category, placement});
    });
    const {preview, ...result} = prepared;
    return {...result, preview: URL.createObjectURL(preview)};
  } finally { worker.terminate(); }
}
