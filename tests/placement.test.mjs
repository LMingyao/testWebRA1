import test from "node:test";
import assert from "node:assert/strict";
import {
  galleryPhotos,
  workPhotos,
  validateContent,
  movePhotoWithinPlacement,
} from "../app/shared.js";
import { fixture } from "./fixture.mjs";
test("banner photographs never duplicate in the grid", () => {
  const data = structuredClone(fixture);
  data.photos[0].placement = "hero";
  data.photos[1].placement = "gallery";
  assert.equal(validateContent(data), data);
  assert.deepEqual(
    galleryPhotos(data).map((p) => p.id),
    ["photo-two"],
  );
  assert.deepEqual(
    galleryPhotos(data, "aviation").map((p) => p.id),
    ["photo-two"],
  );
  data.photos[1].published = false;
  assert.deepEqual(galleryPhotos(data), []);
});

test("one category controls both opening panoramas and viewer photographs", () => {
  const data = structuredClone(fixture);
  data.categories.push({ id: "wildlife", label: "Wildlife" });
  data.photos[0].placement = "hero";
  data.photos.push({ ...data.photos[1], id: "bird", category: "wildlife" });
  data.photos.push({ ...data.photos[0], id: "hidden", published: false });
  assert.deepEqual(
    workPhotos(data, "aviation").map((p) => p.id),
    ["photo-one", "photo-two"],
  );
  assert.deepEqual(
    workPhotos(data, "wildlife").map((p) => p.id),
    ["bird"],
  );
  assert.deepEqual(workPhotos(data, "portrait"), []);
  assert.deepEqual(
    workPhotos(data).map((p) => p.id),
    ["photo-one", "photo-two", "bird"],
  );
});
test("old records default to gallery; invalid placement is rejected", () => {
  const data = structuredClone(fixture);
  assert.equal(galleryPhotos(data).length, 2);
  data.photos[0].placement = "both";
  assert.throws(() => validateContent(data), /placement/);
});
test("ordering stays within its display area even when records are interleaved", () => {
  const data = structuredClone(fixture);
  data.photos[0].placement = "hero";
  data.photos.push({ ...data.photos[0], id: "hero-two" });
  assert.equal(movePhotoWithinPlacement(data, "hero-two", -1), true);
  assert.deepEqual(
    data.photos.map((p) => p.id),
    ["hero-two", "photo-two", "photo-one"],
  );
  assert.equal(movePhotoWithinPlacement(data, "photo-two", -1), false);
  assert.equal(movePhotoWithinPlacement(data, "hero-two", -1), false);
});
