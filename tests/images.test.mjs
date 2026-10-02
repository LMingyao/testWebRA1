import test from "node:test";
import assert from "node:assert/strict";
import { photoImage, photoSource, fittedPhotoWidth } from "../app/images.js";
import { contentImagePaths } from "../app/shared.js";
import { fixture } from "./fixture.mjs";

test("image widths follow the original ratio and duplicate small renditions collapse", () => {
  const portrait = { ...fixture.photos[0], width: 1000, height: 2000 };
  const html = photoImage(portrait, { sizes: "300px", eager: true });
  assert.match(html, /320w, .*640w, .*960w/);
  assert.match(html, /sizes="300px"/);
  assert.match(html, /loading="eager"/);
  const small = photoImage({ ...portrait, width: 200, height: 400, thumbnail: undefined });
  assert.match(small, /srcset="media\/one-1280.webp 200w"/);
  assert.match(small, /loading="lazy"/);
  assert.doesNotMatch(photoImage(fixture.photos[1]), /srcset=/);
});

test("shared media references include the about photo, omit missing variants and deduplicate", () => {
  const data = structuredClone(fixture);
  data.photos[1].large = data.photos[0].large;
  assert.deepEqual([...contentImagePaths(data)], [
    "assets/about.jpg", "assets/one.jpg", "media/one-640.webp",
    "media/one-1280.webp", "media/one-1920.webp", "assets/two.jpg",
  ]);
});

test("stage image selection accounts for both fitted height and device pixel density", () => {
  const portrait = { ...fixture.photos[0], width: 1000, height: 1500 };
  assert.equal(fittedPhotoWidth(portrait, { width: 1200, height: 600 }), 400);
  assert.equal(photoSource(portrait, { width: 1200, height: 600 }), portrait.thumbnail);
  assert.equal(photoSource(portrait, { width: 1200, height: 600, pixelRatio: 2 }), portrait.display);
  assert.equal(photoSource(portrait, { width: 1200, height: 600, pixelRatio: 3 }), portrait.large);
  const landscape = fixture.photos[0];
  assert.equal(photoSource(landscape, { width: 350, height: 700, pixelRatio: 2 }), landscape.display);
  assert.equal(photoSource(landscape, { width: 2000, height: 1000, pixelRatio: 2 }), landscape.large);
  assert.equal(photoSource(fixture.photos[1], { width: 350 }), fixture.photos[1].image);
});
