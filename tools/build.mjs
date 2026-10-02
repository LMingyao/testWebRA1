import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateContent, contentImagePaths, escapeHTML } from "../app/shared.js";
import { pageMetadata, categoryPages } from "../app/metadata.js";
import { arrowIcon } from "../app/icons.js";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const content = validateContent(
  JSON.parse(await readFile(path.join(root, "content/gallery.json"), "utf8")),
);
for (const file of contentImagePaths(content)) await access(path.join(root, file));
const template = await readFile(path.join(root, "tools/page.html"), "utf8");
const entries = [
  ["index.html", "portfolio", "all"],
  ["about_me.html", "about", "all"],
  ["contact.html", "contact", "all"],
  ...Object.entries(categoryPages).map(([id, file]) => [file, "portfolio", id]),
];
for (const [file, page, category] of entries) {
  const metadata = pageMetadata(content, page, category);
  await writeFile(
    path.join(root, file),
    template.replaceAll("{{page}}", page).replaceAll("{{title}}", escapeHTML(metadata.title))
      .replaceAll("{{description}}", escapeHTML(metadata.description))
      .replaceAll("{{canonical}}", escapeHTML(metadata.canonical))
      .replaceAll("{{previousArrow}}", arrowIcon(-1)).replaceAll("{{nextArrow}}", arrowIcon(1)),
  );
}
await writeFile(path.join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(([file]) => `  <url><loc>https://mingyaophoto.com/${file}</loc></url>`).join("\n")}\n</urlset>\n`);
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
