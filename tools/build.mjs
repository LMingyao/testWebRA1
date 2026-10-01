import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateContent } from "../app/shared.js";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const content = validateContent(
  JSON.parse(await readFile(path.join(root, "content/gallery.json"), "utf8")),
);
for (const photo of content.photos)
  for (const key of ["image", "thumbnail", "display", "large"])
    if (photo[key]) await access(path.join(root, photo[key]));
await access(path.join(root, content.site.aboutImage));
const template = await readFile(path.join(root, "tools/page.html"), "utf8");
for (const [file, page, title] of [
  ["index.html", "portfolio", "Selected work"],
  ["ptr.html", "portrait", "Portraits"],
  ["about_me.html", "about", "About"],
  ["contact.html", "contact", "Get in touch"],
]) {
  await writeFile(
    path.join(root, file),
    template.replaceAll("{{page}}", page).replaceAll("{{title}}", title),
  );
}
for (const file of ["BW.html", "indexFR.html"])
  await writeFile(
    path.join(root, file),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=index.html"><title>Collection · Mingyao Li</title></head><body><a href="index.html">Continue to the photography collection</a></body></html>\n',
  );
console.log(
  `Validated ${content.photos.length} photographs and generated static Pages entry points.`,
);
