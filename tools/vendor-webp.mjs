import {readFile, mkdir, copyFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "node_modules/@jsquash/webp");
const destination = path.join(root, "admin/vendor/webp");
const {version} = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
if (version !== "1.5.0") throw new Error("Review codec changes before updating the pinned vendor version.");
await mkdir(destination, {recursive: true});
for (const [from, to] of [["codec/enc/webp_enc.js", "webp_enc.js"], ["codec/enc/webp_enc.wasm", "webp_enc.wasm"], ["meta.js", "meta.js"], ["LICENSE", "LICENSE"]])
  await copyFile(path.join(source, from), path.join(destination, to));
console.log("Copied the pinned lossless WebP encoder and its license. No originals or decoder assets included.");
