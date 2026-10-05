import createEncoder from "./vendor/webp/webp_enc.js";
import {defaultOptions} from "./vendor/webp/meta.js";

export async function createLosslessEncoder(moduleOptions = {}) {
  const codec = await createEncoder({noInitialRun: true, ...moduleOptions});
  return pixels => {
    const encoded = codec.encode(pixels.data, pixels.width, pixels.height,
      {...defaultOptions, lossless: 1, near_lossless: 100, exact: 1, quality: 75, method: 4});
    if (!encoded?.byteLength) throw new Error("无损图片编码失败。");
    return encoded;
  };
}
