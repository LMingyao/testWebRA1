import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateContent } from "../app/shared.js";

// JSON is quoted as a SQL string; apostrophes are doubled, never interpolated as SQL.
const sql = (value) => value === null || value === undefined ? "null"
  : typeof value === "boolean" || typeof value === "number" ? String(value)
  : `'${String(value).replaceAll("'", "''")}'`;

export function prepareMigration(content) {
  validateContent(content);
  const media = new Map();
  const include = (bucket, file) => {
    if (file) media.set(`${bucket}/${file}`, { bucket, path: file, source: file });
  };
  const statements = [
    "-- Generated from content/gallery.json; use only after schema.sql in an empty gallery.",
    "begin;",
    "set local standard_conforming_strings = on;",
    "do $$ begin if exists(select 1 from public.gallery_settings) or exists(select 1 from public.gallery_categories) or exists(select 1 from public.gallery_photos) or exists(select 1 from public.gallery_originals) then raise exception 'Gallery is not empty; seed will not overwrite existing content'; end if; end; $$;",
    `insert into public.gallery_settings(id, version, site) values (true, 1, ${sql(JSON.stringify(content.site))}::jsonb);`,
  ];
  include("gallery-images", content.site.aboutImage);
  for (const [position, category] of content.categories.entries())
    statements.push(`insert into public.gallery_categories(id, label, position) values (${sql(category.id)}, ${sql(category.label)}, ${position});`);
  for (const [position, photo] of content.photos.entries()) {
    const image = photo.large || photo.display || photo.thumbnail || photo.image;
    const values = [photo.id, photo.category, photo.title, photo.alt, photo.width, photo.height,
      photo.placement || "gallery", photo.published, photo.homeSelected === true, photo.featured,
      position, image, photo.thumbnail, photo.display, photo.large];
    statements.push(`insert into public.gallery_photos(id, category, title, alt, width, height, placement, published, home_selected, featured, position, image, thumbnail, display, large) values (${values.map(sql).join(", ")});`);
    for (const file of [image, photo.thumbnail, photo.display, photo.large]) include("gallery-images", file);
    include("gallery-originals", photo.image);
    statements.push(`insert into public.gallery_originals(photo_id, path) values (${sql(photo.id)}, ${sql(photo.image)});`);
  }
  statements.push("commit;", "");
  return { sql: statements.join("\n"), media: [...media.values()] };
}

export async function writeMigration(root) {
  const content = JSON.parse(await readFile(path.join(root, "content/gallery.json"), "utf8"));
  const result = prepareMigration(content);
  let bytes = 0;
  for (const item of result.media) {
    const info = await stat(path.join(root, item.source));
    item.bytes = info.size;
    bytes += info.size;
  }
  const destination = path.join(root, ".local/supabase");
  await mkdir(destination, { recursive: true });
  // Only these generated files are replaced. No uploads or content writes occur.
  await writeFile(path.join(destination, "seed.sql"), result.sql);
  await writeFile(path.join(destination, "media-manifest.json"), JSON.stringify({
    photos: content.photos.length, files: result.media.length, bytes, media: result.media,
  }, null, 2) + "\n");
  console.log(`Prepared ${content.photos.length} photos, ${result.media.length} files (${(bytes / 1048576).toFixed(2)} MiB) in .local/supabase. Nothing uploaded.`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await writeMigration(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
