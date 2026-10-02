import { readFile, writeFile, mkdir, stat, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { validateContent, contentImagePaths } from "../app/shared.js";

const quote = value => `'${String(value).replaceAll("'", "''")}'`;
export function seedSQL(data, media) {
  validateContent(data);
  const document = JSON.stringify(data);
  if (Buffer.byteLength(document) > 900000) throw new Error("Content exceeds the D1 document limit.");
  const revision = createHash("sha256").update(document).digest("hex");
  // The singleton INSERT fails in a nonempty database; never silently replace it.
  return `-- Initial import only. Export/back up cloud content before any manual changes.\n` +
    `INSERT INTO gallery_content(id, revision, document) VALUES (1, ${quote(revision)}, ${quote(document)});\n` +
    `INSERT INTO gallery_media(path, digest, bytes) SELECT json_extract(value, '$.path'), json_extract(value, '$.digest'), json_extract(value, '$.bytes') FROM json_each(${quote(JSON.stringify(media))});\n`;
}
export async function prepareD1(root) {
  const data = validateContent(JSON.parse(await readFile(path.join(root, "content/gallery.json"), "utf8")));
  const media = [];
  for (const file of contentImagePaths(data)) {
    const source = path.join(root, file);
    media.push({ path: file, bytes: (await stat(source)).size,
      digest: createHash("sha256").update(await readFile(source)).digest("hex") });
  }
  const destination = path.join(root, ".local/cloudflare");
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "seed.sql"), seedSQL(data, media));
  await writeFile(path.join(destination, "media-manifest.json"), JSON.stringify(media, null, 2) + "\n");
  // Copy an explicit list: never deploy the repository, originals, .local secrets,
  // scripts, database seed, or retired files as Worker assets.
  const files = ["admin/index.html", "admin/admin.js", "admin/admin.css", "admin/store.js",
    "admin/d1-store.js", "admin/images.js", "app/shared.js", "app/backend.js", "app/design.css", "app/wordmark.css",
    "assets/favicon.svg", "content/backend.json", "admin/login.html", "admin/login.js",
    "admin/login.css", "app/password.js"];
  for (const file of files) {
    const target = path.join(destination, "assets", file);
    await mkdir(path.dirname(target), { recursive: true });
    if (file === "admin/index.html") {
      const html = (await readFile(path.join(root, file), "utf8"))
        .replaceAll('href="../index.html"', 'href="https://mingyaophoto.com/index.html"');
      await writeFile(target, html);
    } else await copyFile(path.join(root, file), target);
  }
  console.log(`Prepared D1 seed (${data.photos.length} photos), ${media.length} media references and protected admin assets. Nothing deployed.`);
  return { data, media };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await prepareD1(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
