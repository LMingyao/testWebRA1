import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateContent, safeImage, escapeHTML } from "../app/shared.js";
import { fixture as content } from "./fixture.mjs";
test("current content remains valid as the owner edits the collection", async () => {
  const current = JSON.parse(
    await readFile(new URL("../content/gallery.json", import.meta.url), "utf8"),
  );
  assert.equal(validateContent(current), current);
});
test("reject traversal, active URLs and unsafe social links", () => {
  for (const path of [
    "assets/../secret.jpg",
    "https://example.com/a.jpg",
    "media/a.svg",
    "media/a.jpg?x=1",
  ])
    assert.equal(safeImage(path), false);
  const data = structuredClone(content);
  data.site.socials[0].url = "javascript:alert(1)";
  assert.throws(() => validateContent(data));
  assert.equal(
    escapeHTML('<img onerror="x">'),
    "&lt;img onerror=&quot;x&quot;&gt;",
  );
});
test("reject missing category, duplicate IDs and empty descriptions", () => {
  let data = structuredClone(content);
  data.photos[0].category = "missing";
  assert.throws(() => validateContent(data));
  data = structuredClone(content);
  data.photos[1].id = data.photos[0].id;
  assert.throws(() => validateContent(data));
  data = structuredClone(content);
  data.photos[0].alt = "";
  assert.throws(() => validateContent(data));
});

test("optional composition settings preserve old documents and reject invalid input", () => {
  const data = structuredClone(content);
  assert.equal(validateContent(data), data);
  data.photos[0].presentation = "solo";
  data.photos[1].group = "秋日人像";
  assert.equal(validateContent(data), data);
  data.photos[0].presentation = "crop";
  assert.throws(() => validateContent(data));
  data.photos[0].presentation = "auto";
  for (const group of [null, 12, "x".repeat(81)]) {
    data.photos[1].group = group;
    assert.throws(() => validateContent(data));
  }
});
