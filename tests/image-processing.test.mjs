import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createLosslessEncoder} from "../admin/webp-encoder.js";
import createDecoder from "@jsquash/webp/codec/dec/webp_dec.js";
import {jpegSource} from "../admin/jpeg-source.js";
import {fitDimensions, renditionSizes} from "../app/media-policy.js";

test("display encoding preserves every resized RGBA channel, including transparent pixels", async () => {
  const encode = await createLosslessEncoder({wasmBinary: await readFile(new URL('../admin/vendor/webp/webp_enc.wasm', import.meta.url))});
  const decode = await createDecoder({noInitialRun:true, wasmBinary: await readFile(new URL('../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm', import.meta.url))});
  const width = 37, height = 19, data = new Uint8ClampedArray(width * height * 4);
  for (let i=0; i<data.length; i++) data[i] = (i * 137 + Math.floor(i / 13) * 17) % 256;
  const encoded = encode({width,height,data});
  assert.equal(new TextDecoder().decode(encoded.subarray(12,16)), 'VP8L');
  const output = decode.decode(encoded);
  assert.equal(output.width, width); assert.equal(output.height, height);
  assert.deepEqual(new Uint8ClampedArray(output.data), data);
});

function jpeg({width=6000, height=4000, precision=8, components=3, orientation=1}={}) {
  const exif = Buffer.from('45786966000049492a0008000000010012010300010000000100000000000000','hex');
  exif.writeUInt16LE(orientation,24);
  const frame = Buffer.from([precision,height>>8,height&255,width>>8,width&255,components]);
  const segment = (marker,data) => Buffer.concat([Buffer.from([255,marker,(data.length+2)>>8,(data.length+2)&255]),data]);
  return new Blob([Buffer.from([255,216]), segment(0xe1,exif), segment(0xe1,Buffer.from('unrelated XMP')), segment(0xc0,frame), Buffer.from([255,218,0,2])]);
}
test("JPEG preflight honors EXIF rotation and rejects unsupported precision before decoding", async () => {
  assert.deepEqual(await jpegSource(jpeg()), {width:6000,height:4000});
  assert.deepEqual(await jpegSource(jpeg({orientation:6})), {width:4000,height:6000});
  await assert.rejects(()=>jpegSource(jpeg({precision:12})), /8 位/);
  await assert.rejects(()=>jpegSource(jpeg({components:4})), /CMYK/);
  await assert.rejects(()=>jpegSource(jpeg({width:16000,height:16000})), /1 亿/);
  await assert.rejects(()=>jpegSource(new Blob(['not a JPEG'])), /内容无效/);
  const valid=jpeg(); await assert.rejects(()=>jpegSource(valid.slice(0,12)), /不完整/);
});
test("gallery and panorama sizes keep aspect ratio, do not crop or upscale tiny images", () => {
  assert.deepEqual(renditionSizes('gallery'), [640,1280,2048,3072]);
  assert.deepEqual(renditionSizes('hero'), [640,1280,2048,4096]);
  assert.deepEqual(fitDimensions(6000,4000,3072), {width:3072,height:2048});
  assert.deepEqual(fitDimensions(9000,3000,4096), {width:4096,height:1365});
  assert.deepEqual(fitDimensions(4000,6000,3072), {width:2048,height:3072});
  assert.deepEqual(fitDimensions(300,200,3072), {width:300,height:200});
});
