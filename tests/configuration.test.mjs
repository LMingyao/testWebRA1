import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { collections, defaultCollection, resolveCollection, gearItems, siteSettings, editableCollections } from "../app/config.js";
import { setCollectionVisible, moveCollection } from "../admin/config-editor.js";
import { validateContent, workPhotos } from "../app/shared.js";
import { categoryURL, categoryFromURL } from "../app/metadata.js";
import { renderEditorial } from "../app/editorial.js";
import { previewContent } from "../admin/preview-data.js";

test("default entry, explicit selection URLs and hidden routes remain consistent after repeated edits", () => {
  const data = structuredClone(fixture), photos = structuredClone(data.photos);
  data.categories.push({ id: "travel", label: "Travel" });
  assert.equal(defaultCollection(data), "all");
  editableCollections(data).default = "travel";
  assert.equal(categoryFromURL(new URL("https://mingyaophoto.com/"), data), "travel");
  assert.equal(categoryURL("all", data), "index.html?category=all");
  assert.equal(categoryFromURL(new URL("https://mingyaophoto.com/index.html?category=all"), data), "all");
  moveCollection(data, "travel", -1);
  moveCollection(data, "travel", -1);
  assert.deepEqual(collections(data).map(item => item.id), ["travel", "all", "aviation"]);
  setCollectionVisible(data, "travel", false);
  assert.equal(defaultCollection(data), "all");
  assert.equal(resolveCollection(data, "travel"), "all");
  assert.equal(resolveCollection(data, "missing"), "all");
  setCollectionVisible(data, "aviation", false);
  assert.deepEqual(workPhotos(data, "all"), []);
  assert.deepEqual(workPhotos(data, "aviation"), []);
  assert.throws(() => setCollectionVisible(data, "all", false), /at least one/);
  setCollectionVisible(data, "aviation", true);
  assert.deepEqual(workPhotos(data, "all"), photos);
  assert.deepEqual(data.photos, photos);
  assert.equal(validateContent(data), data);
});
test("configuration validation rejects broken defaults, duplicate order IDs, invalid flags and empty equipment", () => {
  for (const change of [
    data => { data.collections = { default: "missing" }; },
    data => { data.collections = { order: ["all", "all"] }; },
    data => { data.collections = { selected: { id: "travel" } }; },
    data => { data.collections = { defaultView: "crop" }; },
    data => { data.categories[0].visible = "false"; },
    data => { data.site.showAbout = "false"; },
    data => { data.site.gear = [""]; },
    data => { data.site.gear = ["x".repeat(201)]; },
    data => { data.site.brandTitle = ""; },
  ]) {
    const data = structuredClone(fixture); change(data); assert.throws(() => validateContent(data));
  }
});
test("equipment supports legacy documents and renders separate escaped lines without an empty section", () => {
  assert.deepEqual(gearItems("Body · Lens A, Lens B · Converter A / Converter B"), ["Body", "Lens A", "Lens B", "Converter A", "Converter B"]);
  const data = structuredClone(fixture), main = { innerHTML: "" };
  data.site.gear = ["Camera", "Lens <A>"];
  renderEditorial(main, data, "about");
  assert.equal((main.innerHTML.match(/<li>/g) || []).length, 2);
  assert.match(main.innerHTML, /Lens &lt;A&gt;/);
  data.site.gear = [];
  assert.equal(validateContent(data), data);
  renderEditorial(main, data, "about");
  assert.ok(!main.innerHTML.includes('class="gear"'));
  data.site.contactText = "Available for commissions";
  data.site.email = "new@example.com";
  renderEditorial(main, data, "contact");
  assert.match(main.innerHTML, /mailto:new@example.com/);
  assert.match(main.innerHTML, /Available for commissions/);
  assert.equal(siteSettings(fixture.site).brandTitle, "Photography");
});
test("about replacement and a pending library image resolve in private preview without adding photographs", () => {
  const data = structuredClone(fixture), originalCount = data.photos.length;
  data.site.aboutImage = "media/replacement-1920.webp";
  const pending = new Map([[data.site.aboutImage, "blob:https://studio.test/about"]]);
  assert.equal(previewContent(data, path => path, pending).site.aboutImage, "blob:https://studio.test/about");
  data.site.aboutImage = data.photos[0].image;
  pending.set(data.photos[0].id, "blob:https://studio.test/library");
  assert.equal(previewContent(data, path => path, pending).site.aboutImage, "blob:https://studio.test/library");
  assert.equal(data.photos.length, originalCount);
});
