import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateContent, contentImagePaths } from "../app/shared.js";
import { arrowIcon } from "../app/icons.js";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const content = validateContent(
  JSON.parse(await readFile(path.join(root, "content/gallery.json"), "utf8")),
);
for (const file of contentImagePaths(content)) await access(path.join(root, file));
const template = await readFile(path.join(root, "tools/page.html"), "utf8");
for (const [file, page, title] of [
  ["index.html", "portfolio", "Selected work"],
  ["ptr.html", "portrait", "Portraits"],
  ["about_me.html", "about", "About"],
  ["contact.html", "contact", "Get in touch"],
]) {
  await writeFile(
    path.join(root, file),
    template.replaceAll("{{page}}", page).replaceAll("{{title}}", title)
      .replaceAll("{{previousArrow}}", arrowIcon(-1)).replaceAll("{{nextArrow}}", arrowIcon(1)),
  );
}
console.log(
  `Validated ${content.photos.length} photographs and generated static Pages entry points.`,
);
