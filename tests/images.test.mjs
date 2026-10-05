import test from "node:test";
import assert from "node:assert/strict";
import { photoImage, photoSource, fittedPhotoWidth, photoCandidates } from "../app/images.js";
import { contentImagePaths, validateContent } from "../app/shared.js";
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

test("new responsive renditions use actual pixel widths, survive publication and reject invalid metadata", () => {
  const data = structuredClone(fixture), photo = data.photos[0];
  Object.assign(photo, {width:9000,height:3000,image:'media/new-4096.webp',thumbnail:'media/new-640.webp',display:'media/new-1280.webp',large:'media/new-4096.webp',
    renditions:[{path:'media/new-2048.webp',width:2048,height:683},{path:'media/new-640.webp',width:640,height:213},
      {path:'media/new-4096.webp',width:4096,height:1365},{path:'media/new-1280.webp',width:1280,height:427}]});
  validateContent(data);
  assert.deepEqual(photoCandidates(photo).map(item=>item.width), [640,1280,2048,4096]);
  assert.equal(photoSource(photo,{width:1320,pixelRatio:1}), 'media/new-2048.webp');
  assert.equal(photoSource(photo,{width:1320,pixelRatio:2}), 'media/new-4096.webp');
  assert.equal(photoSource(photo,{width:300,pixelRatio:2}), 'media/new-640.webp');
  assert.ok(contentImagePaths(data).has('media/new-2048.webp'));
  assert.match(photoImage(photo), /media\/new-4096.webp 4096w/);
  photo.renditions[0].path = 'https://untrusted.invalid/image.webp';
  assert.throws(()=>validateContent(data), /renditions/);
  photo.renditions[0].path = 'media/new-2048.webp'; photo.renditions[0].height = 2048;
  assert.throws(()=>validateContent(data), /renditions/);
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
