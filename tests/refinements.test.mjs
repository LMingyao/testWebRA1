import test from "node:test";
import assert from "node:assert/strict";
import { reorderPhoto, validateContent } from "../app/shared.js";
import { previewContent } from "../admin/preview-data.js";
import { categoryURL, categoryFromURL, pageMetadata } from "../app/metadata.js";
import { photoRows } from "../app/layout.js";
import { fixture } from "./fixture.mjs";
import { photographScrollY } from '../app/reading-position.js';

test("drag ordering moves within display slots without changing unrelated photos or visibility", () => {
 const data = structuredClone(fixture);
 data.photos = [
  {...data.photos[0], id:"a", placement:"gallery"},
  {...data.photos[0], id:"hero", placement:"hero"},
  {...data.photos[1], id:"b", placement:"gallery"},
  {...data.photos[0], id:"c", placement:"gallery"},
 ];
 const original = structuredClone(data.photos);
 assert.equal(reorderPhoto(data,"c","a"),true);
 assert.deepEqual(data.photos.map(p=>p.id),["c","hero","a","b"]);
 assert.equal(reorderPhoto(data,"c","b",true),true);
 assert.deepEqual(data.photos,original);
 assert.equal(reorderPhoto(data,"hero","a"),false);
 assert.equal(reorderPhoto(data,"missing","a"),false);
 assert.equal(reorderPhoto(data,"a","a"),false);
});

test("desktop rows respect viewport height and avoid an unnecessary last portrait orphan", () => {
 const photos = [.66,.66,1.4,1.33,2,.74].map((ratio,id)=>({id,width:ratio*1000,height:1000}));
 for (const maxHeight of [240,520,880]) {
  const rows = photoRows(photos,{width:1153,targetHeight:Math.min(480,maxHeight),maxHeight});
  assert.deepEqual(rows.flatMap(row=>row.photos),photos);
  assert.ok(rows.every(row=>row.height<=maxHeight && row.width<=1153+.001));
 }
 const rows=photoRows(photos,{width:1153,targetHeight:480,maxHeight:520});
 assert.equal(rows.at(-1).photos.length,2);
 photos.at(-1).presentation="solo";
 assert.equal(photoRows(photos,{width:1153,maxHeight:520}).at(-1).photos.length,1);
 const mobile=photoRows(photos,{width:350,maxHeight:240});
 assert.ok(mobile.every(row=>row.photos[0].presentation==='solo' ? row.height<=240 && row.width<=350 : row.width===350));
});

test('changed photographs remain still when visible and scroll only far enough when outside the viewport',()=>{
 assert.equal(photographScrollY({top:100,bottom:550},1000,700),1000);
 assert.equal(photographScrollY({top:600,bottom:900},1000,700),1224);
 assert.equal(photographScrollY({top:-200,bottom:100},1000,700),776);
 assert.equal(photographScrollY({top:600,bottom:1600},1000,700),1576);
 assert.equal(photographScrollY({top:0,bottom:900},0,700),0);
});

test("preview resolves local pending images in a clone and preserves hidden/selected draft flags", () => {
 const data=structuredClone(fixture), original=structuredClone(data);
 data.photos[0].published=false;
 original.photos[0].published=false;
 const preview=previewContent(data,path=>`https://images.example/${path}`,new Map([[data.photos[0].id,"blob:https://studio.test/pending"]]));
 assert.equal(preview.photos[0].image,"blob:https://studio.test/pending");
 assert.equal(preview.photos[0].published,false);
 assert.equal(preview.photos[0].homeSelected,data.photos[0].homeSelected);
 assert.ok(preview.site.aboutImage.startsWith("https://images.example/"));
 assert.deepEqual(data,original);
 data.photos[0].image="https://untrusted.test/photo.jpg";
 assert.throws(()=>previewContent(data,p=>p),/path/);
});

test("category metadata has stable crawlable routes and custom categories keep a working fallback", () => {
 for (const category of ["aviation","landscape","portrait","wildlife","motorsport","all","travel","constructor"]) {
  const url=new URL(categoryURL(category),"https://mingyaophoto.com/");
  assert.equal(categoryFromURL(url),category);
 }
 assert.equal(categoryFromURL(new URL("https://mingyaophoto.com/index.html?category=portrait")),"portrait");
 const data=structuredClone(fixture);
 data.categories[0].description="A carefully edited aviation portfolio.";
 const metadata=pageMetadata(data,"portfolio","aviation");
 assert.equal(metadata.description,data.categories[0].description);
 assert.match(metadata.title,/Aviation/);
 assert.equal(metadata.canonical,"https://mingyaophoto.com/aviation.html");
 assert.equal(metadata.image,"https://mingyaophoto.com/assets/social-card.png");
 data.categories[0].description="x".repeat(401);
 assert.throws(()=>validateContent(data),/Category descriptions/);
});
