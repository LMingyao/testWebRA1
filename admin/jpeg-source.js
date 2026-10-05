// Inspect bounded marker segments before decoding; EXIF rotation affects dimensions.
function exifOrientation(bytes) {
  if (bytes.length < 14 || new TextDecoder().decode(bytes.subarray(0, 6)) !== "Exif\0\0") return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset + 6, bytes.byteLength - 6);
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return 1;
  const little = order === 0x4949;
  if (view.getUint16(2, little) !== 42) return 1;
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > view.byteLength) return 1;
  const count = view.getUint16(offset, little);
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    if (view.getUint16(entry, little) === 0x0112 && view.getUint16(entry + 2, little) === 3 && view.getUint32(entry + 4, little) === 1) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

export async function jpegSource(file) {
  const read = async (start, size) => new Uint8Array(await file.slice(start, start + size).arrayBuffer());
  const signature = await read(0, 2);
  if (signature[0] !== 0xff || signature[1] !== 0xd8) throw new Error("JPG 文件内容无效，请重新导出照片。");
  let offset = 2, orientation = 1, dimensions;
  while (offset + 4 <= file.size) {
    let header = await read(offset, 4);
    if (header[0] !== 0xff) throw new Error("JPG 文件结构无效。");
    while (header[1] === 0xff) { offset++; header = await read(offset, 4); }
    const marker = header[1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = header[2] * 256 + header[3];
    if (length < 2 || offset + 2 + length > file.size) throw new Error("JPG 文件不完整。");
    if (marker === 0xe1) {
      const metadata = await read(offset + 4, length - 2);
      if (new TextDecoder().decode(metadata.subarray(0, 6)) === "Exif\0\0") orientation = exifOrientation(metadata);
    }
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const frame = await read(offset + 4, Math.min(6, length - 2));
      if (frame.length < 6 || frame[0] !== 8 || ![1, 3].includes(frame[5]))
        throw new Error("请上传 8 位 RGB／灰度 JPG；其他色深或 CMYK 请先导出为 sRGB JPG。");
      dimensions = {width: frame[3] * 256 + frame[4], height: frame[1] * 256 + frame[2]};
    }
    offset += 2 + length;
  }
  if (!dimensions || !dimensions.width || !dimensions.height) throw new Error("无法读取 JPG 尺寸，请重新导出照片。");
  if (dimensions.width > 30000 || dimensions.height > 30000 || dimensions.width * dimensions.height > 100000000)
    throw new Error("原图超过 1 亿像素或最长边 30000 像素，请先缩小原图尺寸。");
  return orientation >= 5 ? {width: dimensions.height, height: dimensions.width} : dimensions;
}
