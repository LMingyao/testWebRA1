export const MIB = 1024 * 1024;
export const JPEG_INPUT_LIMIT = 100 * MIB;
export const OTHER_INPUT_LIMIT = 25 * MIB;
export const DISPLAY_FILE_LIMIT = 8 * MIB;
export const MEDIA_BATCH_LIMIT = 16 * MIB;
export const SOURCE_PIXEL_LIMIT = 120000000;
export const SOURCE_EDGE_LIMIT = 30000;
export const MEDIA_PATH = /^media\/(photo-[a-f0-9-]{36})-(640|1280|1920|2048|3072|4096)\.webp$/;

export function validateSourceFile(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(`${file.name}：请选择 JPG、PNG 或 WebP 图片。`);
  const limit = file.type === "image/jpeg" ? JPEG_INPUT_LIMIT : OTHER_INPUT_LIMIT;
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > limit)
    throw new Error(`${file.name}：请选择 ${limit / MIB} MB 以内的非空图片。`);
}

export function renditionSizes(placement = "gallery") {
  return [640, 1280, 2048, placement === "hero" ? 4096 : 3072];
}

export function validateSourceDimensions({width, height}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new Error("原图尺寸无效，请重新导出照片。");
  if (width > SOURCE_EDGE_LIMIT || height > SOURCE_EDGE_LIMIT || width * height > SOURCE_PIXEL_LIMIT)
    throw new Error(`原图 ${width} × ${height}（约 ${(width * height / 1000000).toFixed(1)} 百万像素）超过处理上限：1.2 亿像素或最长边 ${SOURCE_EDGE_LIMIT} 像素。`);
}

export function fitDimensions(width, height, longEdge) {
  const ratio = Math.min(1, longEdge / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio))};
}
