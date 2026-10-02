import test from "node:test";
import assert from "node:assert/strict";
import { backendConfig, loadPublicContent, contentForDisplay } from "../app/backend.js";
import { fixture } from "./fixture.mjs";

test("public loader selects static or D1 data and never falls back to stale photos", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  let config = { apiBase: "", adminURL: "" };
  let unavailable = false;
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).endsWith("/content/backend.json")) return new Response(JSON.stringify(config));
    return unavailable ? new Response("{}", { status: 503 }) : new Response(JSON.stringify({ photos: [] }));
  };
  await loadPublicContent();
  assert.equal(calls.at(-1), "content/gallery.json");
  config = { apiBase: "https://studio.example.com/", adminURL: "https://studio.example.com/admin/" };
  await loadPublicContent();
  assert.equal(calls.at(-1), "https://studio.example.com/api/content");
  calls.length = 0;
  unavailable = true;
  await assert.rejects(() => loadPublicContent(), /unavailable/);
  assert.equal(calls.includes("content/gallery.json"), false);
});
test("backend configuration rejects insecure remote URLs and embedded credentials", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const apiBase of ["http://studio.example.com", "https://user:secret@studio.example.com", "https://studio.example.com/api", "javascript:alert(1)"]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ apiBase, adminURL: "" }));
    await assert.rejects(() => backendConfig());
  }
});
test("cloud images resolve from the media branch without changing stored logical paths", () => {
  const data = { ...structuredClone(fixture), mediaBase: "https://raw.githubusercontent.com/LMingyao/testWebRA1/review/" };
  const content = contentForDisplay(data);
  assert.equal(content.photos[0].image, data.mediaBase + fixture.photos[0].image);
  assert.equal(content.site.aboutImage, data.mediaBase + fixture.site.aboutImage);
  assert.equal(data.photos[0].image, fixture.photos[0].image);
  assert.equal(contentForDisplay(fixture), fixture);
  assert.throws(() => contentForDisplay({ ...data, mediaBase: "javascript:alert(1)" }));
});
