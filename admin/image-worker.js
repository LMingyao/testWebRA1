import {createLosslessEncoder} from "./webp-encoder.js";
import {validateSourceFile, renditionSizes, fitDimensions, DISPLAY_FILE_LIMIT} from "../app/media-policy.js";
import {jpegSource} from "./jpeg-source.js";

const base64 = bytes => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
};

export async function prepareRenditions(file, category, placement) {
  validateSourceFile(file);
  const sizes = renditionSizes(placement), maximum = sizes.at(-1);
  let source = file.type === "image/jpeg" ? await jpegSource(file) : null;
  const resized = source ? fitDimensions(source.width, source.height, maximum) : null;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, {imageOrientation: "from-image", colorSpaceConversion: "default",
      ...(resized ? {resizeWidth: resized.width, resizeHeight: resized.height, resizeQuality: "high"} : {})});
  } catch { throw new Error("无法解码照片，请重新导出为 sRGB JPG。"); }
  try {
    source ||= {width: bitmap.width, height: bitmap.height};
    if (source.width > 30000 || source.height > 30000 || source.width * source.height > 100000000)
      throw new Error("原图超过 1 亿像素或最长边 30000 像素，请先缩小原图尺寸。");
    const encode = await createLosslessEncoder();
    const id = "photo-" + crypto.randomUUID(), uploads = [], renditions = [], paths = {}, seen = new Map();
    let preview;
    for (const size of sizes) {
      const dimensions = fitDimensions(source.width, source.height, size);
      const key = `${dimensions.width}x${dimensions.height}`;
      if (seen.has(key)) { paths[size] = seen.get(key); continue; }
      const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
      const context = canvas.getContext("2d", {colorSpace: "srgb", willReadFrequently: true});
      if (!context) throw new Error("当前浏览器不支持图片处理。");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      // VP8L preserves resized 8-bit sRGB pixels; no lossy fallback or byte target.
      const encoded = encode(pixels);
      if (encoded.byteLength > DISPLAY_FILE_LIMIT)
        throw new Error("缩图后的无损版本超过 8 MB；请先缩小原图后重试。系统不会自动降低画质。");
      const path = `media/${id}-${size}.webp`;
      paths[size] = path; seen.set(key, path);
      uploads.push({path, base64: base64(encoded)});
      renditions.push({path, ...dimensions});
      preview = new Blob([encoded], {type: "image/webp"});
      canvas.width = canvas.height = 1;
    }
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
    return {photo: {id, title, alt: title, category, placement,
      image: paths[maximum], thumbnail: paths[640], display: paths[1280], large: paths[maximum],
      width: source.width, height: source.height, renditions,
      published: false, featured: false, homeSelected: false}, uploads, preview};
  } finally { bitmap.close(); }
}

self.onmessage = async ({data}) => {
  try { self.postMessage(await prepareRenditions(data.file, data.category, data.placement)); }
  catch (error) { self.postMessage({error: error.message || "图片处理失败。"}); }
};
