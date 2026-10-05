import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateContent, contentImagePaths, escapeHTML } from "../app/shared.js";
import { arrowIcon } from "../app/icons.js";
import { publicationFiles, publishedContent } from "../app/publishing.js";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const content = validateContent(
  JSON.parse(await readFile(path.join(root, "content/gallery.json"), "utf8")),
);
for (const file of contentImagePaths(content)) await access(path.join(root, file));
const template = await readFile(path.join(root, "tools/page.html"), "utf8");
// An old development document must never reintroduce cloud-hidden photographs.
let prerender = false;
try {
  const manifest = JSON.parse(await readFile(path.join(root,"content/publication.json"),"utf8"));
  prerender = manifest.sourceDigest === createHash("sha256").update(JSON.stringify(content)).digest("hex");
} catch (error) { if (error.code !== "ENOENT") throw error; }
const files = publicationFiles(template, publishedContent(content), "local", {prerender});
for (const file of files) {
  if (file.path === "content/publication.json") continue;
  await writeFile(path.join(root,file.path),file.content);
}
await writeFile(path.join(root, "robots.txt"), "User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: https://mingyaophoto.com/sitemap.xml\n");
const preview = template.replaceAll("{{page}}", "portfolio").replaceAll("{{title}}", "Draft preview")
  .replaceAll("{{description}}", "Private draft preview").replaceAll("{{canonical}}", "")
  .replaceAll("{{previousArrow}}", arrowIcon(-1)).replaceAll("{{nextArrow}}", arrowIcon(1))
  .replace('<head>', '<head><base href="../" /><meta name="robots" content="noindex,nofollow" />')
  .replace('src="app/site.js"', 'src="admin/preview.js"');
await writeFile(path.join(root, "admin/preview.html"), preview);
console.log(
  `Validated ${content.photos.length} photographs and generated static Pages entry points.`,
);
