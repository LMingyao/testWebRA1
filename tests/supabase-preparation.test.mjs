import test from "node:test";
import assert from "node:assert/strict";
import { prepareMigration } from "../tools/prepare-supabase.mjs";
import { fixture } from "./fixture.mjs";

test("cloud seed keeps source order and selection while separating originals from display files", () => {
  const data = structuredClone(fixture);
  data.photos[1].published = false;
  data.photos[1].homeSelected = false;
  const before = structuredClone(data);
  const result = prepareMigration(data);
  assert.deepEqual(data, before);
  assert.ok(result.sql.indexOf("'photo-one'") < result.sql.indexOf("'photo-two'"));
  assert.match(result.sql, /'gallery', false, false, false, 1, 'assets\/two.jpg'/);
  assert.ok(result.media.some(item => item.bucket === "gallery-originals" && item.path === "assets/one.jpg"));
  assert.ok(!result.media.some(item => item.bucket === "gallery-images" && item.path === "assets/one.jpg"));
  assert.equal(result.media.filter(item => item.path === "media/one-1920.webp").length, 1);
  assert.match(result.sql, /seed will not overwrite/);
});

test("seed text is SQL-quoted and unsafe file references fail before generation", () => {
  const data = structuredClone(fixture);
  data.photos[0].title = "Mingyao's photo'; drop table gallery_photos; --";
  assert.match(prepareMigration(data).sql, /Mingyao''s photo''; drop table gallery_photos; --'/);
  data.photos[0].image = "assets/../secret.jpg";
  assert.throws(() => prepareMigration(data), /path/);
});
