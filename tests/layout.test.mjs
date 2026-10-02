import test from "node:test";
import assert from "node:assert/strict";
import { photoRows } from "../app/layout.js";

test("mixed shapes keep source order, fit the screen and share a height within each row", () => {
  const photos = [0.7, 0.67, 1.78, 2, 1.5, 1.5, 1.5, 0.66].map((ratio, id) => ({ id, width: ratio * 1000, height: 1000 }));
  for (const width of [350, 720, 1000, 1320, 2000]) {
    const rows = photoRows(photos, { width, gap: 18 });
    assert.deepEqual(rows.flatMap(row => row.photos), photos);
    for (const row of rows) {
      assert.ok(row.photos.length && row.height > 0 && Number.isFinite(row.height));
      assert.ok(row.width <= width + 0.001);
      const sum = row.photos.reduce((sum, photo) => sum + row.height * photo.width / photo.height, 0) + 18 * (row.photos.length - 1);
      assert.ok(Math.abs(sum - row.width) < 0.001);
    }
    if (width === 350) assert.ok(rows.every(row => row.photos.length === 1));
  }
});

test("extreme shapes stand alone and a lone final photo is never stretched to fill the screen", () => {
  assert.deepEqual(photoRows([]), []);
  const wide = { width: 8000, height: 1000 };
  const tall = { width: 300, height: 4000 };
  const portrait = { width: 1000, height: 1500 };
  const rows = photoRows([portrait, wide, tall, portrait], { gap: 18, targetHeight: 280 });
  assert.ok(rows.some(row => row.photos.length === 1 && row.photos[0] === wide));
  assert.ok(rows.some(row => row.photos.length === 1 && row.photos[0] === tall));
  assert.ok(rows.find(row => row.photos[0] === tall).height <= 476);
  assert.ok(rows.at(-1).height <= 280);
  assert.deepEqual(rows.flatMap(row => row.photos), [portrait, wide, tall, portrait]);
});

test("mixed portrait rows remain readable and a balanced final pair fills the row", () => {
  const photos = [0.74, 0.67, 1.78, 2, 1.5, 1.5, 1.5].map((ratio, id) => ({ id, width: ratio * 1000, height: 1000 }));
  const rows = photoRows(photos, { width: 1320 });
  assert.deepEqual(rows.flatMap(row => row.photos), photos);
  for (const row of rows) {
    assert.ok(row.photos.length <= 3);
    assert.ok(row.photos.every(photo => row.height * photo.width / photo.height >= 240));
  }
  assert.ok(Math.abs(rows.at(-1).width - 1320) < 0.001);
});

test("declared groups stay separate, solo photos stand alone and mobile keeps every photograph", () => {
  const photos = [
    { id: "first", width: 1500, height: 1000 },
    { id: "pair-a", width: 1000, height: 1500, group: "Autumn" },
    { id: "pair-b", width: 1000, height: 1500, group: "Autumn" },
    { id: "solo", width: 1500, height: 1000, presentation: "solo" },
    { id: "last", width: 1500, height: 1000 },
  ];
  const rows = photoRows(photos, { width: 1320, targetHeight: 480 });
  assert.deepEqual(rows.flatMap(row => row.photos), photos);
  assert.deepEqual(rows.find(row => row.photos.includes(photos[1])).photos, photos.slice(1, 3));
  assert.deepEqual(rows.find(row => row.photos.includes(photos[3])).photos, [photos[3]]);
  const mobile = photoRows(photos, { width: 350 });
  assert.deepEqual(mobile.flatMap(row => row.photos), photos);
  assert.ok(mobile.every(row => row.photos.length === 1 && row.width === 350));
});

test("long groups wrap within row limits without swallowing neighbouring works", () => {
  const photos = Array.from({ length: 8 }, (_, id) => ({ id, width: 1000, height: 1500, group: id > 0 && id < 7 ? "Portraits" : "" }));
  const rows = photoRows(photos, { width: 1152, targetHeight: 480 });
  assert.deepEqual(rows.flatMap(row => row.photos), photos);
  assert.ok(rows.every(row => row.photos.length <= 3 && new Set(row.photos.map(photo => photo.group)).size === 1));
});
