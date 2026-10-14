import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { uploadItems, processUploads } from "../admin/upload-queue.js";
import { applyPhotoBatch } from "../admin/batch.js";
import { publicationLabel, createPublicationMonitor } from "../admin/publication.js";
import { bindEmailCopy, editorialHTML } from "../app/editorial.js";
import { siteSettings } from "../app/config.js";
import { publicationFiles, publishedContent } from "../app/publishing.js";
import { validateContent } from "../app/shared.js";
import { validateBackupReceipt, backupGuideHTML } from "../admin/backup-guide.js";

test("a failed photo does not stop the queue; retry skips successes and preserves destinations", async () => {
  const files = [{name:"broken.jpg"}, {name:"good.jpg"}, {name:"last.jpg"}];
  const items = uploadItems(files,"aviation","hero"), calls=[], accepted=[];
  let broken=true;
  const prepare = async (file,category,placement) => {
    calls.push([file.name,category,placement]);
    if (file.name === "broken.jpg" && broken) throw new Error("Invalid JPEG");
    return {photo:{id:file.name},preview:"blob:"+file.name};
  };
  await processUploads(items,prepare,result=>accepted.push(result.photo.id));
  assert.deepEqual(items.map(item=>item.status),["failed","done","done"]);
  assert.equal(items[0].file,files[0]); assert.equal(items[1].file,undefined);
  broken=false; await processUploads(items,prepare,result=>accepted.push(result.photo.id));
  assert.deepEqual(accepted,["good.jpg","last.jpg","broken.jpg"]);
  assert.deepEqual(calls.at(-1),["broken.jpg","aviation","hero"]);
  assert.equal(calls.length,4);
});

test("batch operations change selected draft records only and do not publish or reorder them", () => {
  const data=structuredClone(fixture), saved=structuredClone(data);
  data.categories.push({id:"travel",label:"Travel"});
  const ids=data.photos.map(photo=>photo.id);
  applyPhotoBatch(data,[ids[0]],"category","travel");
  applyPhotoBatch(data,[ids[0]],"hide"); applyPhotoBatch(data,[ids[0]],"unselect");
  assert.equal(data.photos[0].category,"travel"); assert.equal(data.photos[0].published,false);
  assert.equal(data.photos[0].homeSelected,false); assert.deepEqual(data.photos[1],saved.photos[1]);
  assert.deepEqual(data.photos.map(photo=>photo.id),ids);
  applyPhotoBatch(data,[ids[0]],"show"); applyPhotoBatch(data,[ids[0]],"select");
  assert.equal(validateContent(data),data); assert.deepEqual(fixture,saved);
  assert.throws(()=>applyPhotoBatch(data,ids,"category","missing"),/有效/);
});

function timers() { let id=0; const tasks=new Map(); return {tasks,setTimeout(fn){tasks.set(++id,fn);return id;},clearTimeout(i){tasks.delete(i);},async next(){const [i,fn]=tasks.entries().next().value;tasks.delete(i);await fn();}}; }
test("publication feedback waits for the matching deployed revision and ignores responses superseded by another save", async () => {
  assert.equal(publicationLabel({revision:"new",publication:{status:"published"}},"old").state,"changed");
  const clock=timers(), element={dataset:{}}; let resolveOld;
  const old={mode:"d1",request:()=>new Promise(resolve=>resolveOld=resolve)};
  const monitor=createPublicationMonitor(element,clock);
  monitor.start(old,"one",{status:"submitted"}); const waiting=clock.next();
  monitor.start({mode:"d1",request:async()=>({revision:"two",publication:{status:"published"}})},"two",{status:"submitted"});
  await clock.next(); assert.equal(element.dataset.state,"complete");
  resolveOld({revision:"one",publication:{status:"failed"}}); await waiting;
  assert.equal(element.dataset.state,"complete"); assert.equal(clock.tasks.size,0);
  monitor.draft(true); assert.match(element.textContent,/当前更改尚未保存/);
  monitor.draft(false); assert.match(element.textContent,/全部完成/);
  monitor.saving(); monitor.unconfirmed(); assert.equal(element.dataset.state,"unknown");
});

test("Contact labels survive two edits through rendering/publication; copy feedback resets and failure exposes email", async () => {
  const data=structuredClone(fixture), template=await readFile(new URL('../tools/page.html',import.meta.url),'utf8');
  for (const [send,copy] of [["Send a note","Copy address"],["Write to me","Copy email address"]]) {
    Object.assign(data.site,{emailActionLabel:send,copyEmailLabel:copy,copiedEmailLabel:"Address copied"}); validateContent(data);
    assert.match(editorialHTML(data,"contact"),new RegExp(send));
    const page=publicationFiles(template,publishedContent(data),send).find(item=>item.path==='contact.html');
    assert.match(page.content,new RegExp(copy));
  }
  const button={dataset:{email:fixture.site.email},isConnected:true}, fallback={hidden:true}, clock=timers();
  let fail=false;
  bindEmailCopy(button,fallback,siteSettings(data.site),{writeText:async text=>{assert.equal(text,fixture.site.email);if(fail)throw new Error("Denied");}},clock);
  await button.onclick(); assert.equal(button.textContent,"Address copied"); await clock.next();
  assert.equal(button.textContent,"Copy email address");
  fail=true; await button.onclick(); assert.equal(fallback.hidden,false); await clock.next();
  assert.equal(button.textContent,"Copy email address");
});

test("404 retains a usable root-relative shell on nested URLs, is noindex and absent from sitemap", async () => {
  const template=await readFile(new URL('../tools/page.html',import.meta.url),'utf8');
  const files=publicationFiles(template,fixture,'test',{prerender:false}), page=files.find(f=>f.path==='404.html').content;
  assert.doesNotMatch(page,/<base /);assert.match(page,/href="\/app\/wordmark.css"/);
  assert.match(page,/src="\/app\/not-found.js"/);assert.match(page,/href="\/index.html">Return to work/);
  assert.match(page,/noindex,follow/);assert.match(page,/Page not found/);
  assert.doesNotMatch(page,/github\.com|<dialog|legacy-link|back-top/);
  assert.doesNotMatch(files.find(f=>f.path==='sitemap.xml').content,/404.html/);
});

test("a downloaded manifest is not a complete-backup receipt", () => {
  assert.throws(()=>validateBackupReceipt({format:"gallery-backup-v1"}),/校验报告/);
  const report={format:"gallery-backup-check-v1",result:"verified",verifiedAt:new Date().toISOString(),revision:"one",mediaCount:3,mediaBytes:20,manifestDigest:"a".repeat(64)};
  assert.equal(validateBackupReceipt(report).mediaCount,3);
  assert.match(backupGuideHTML(report),/3 个照片文件/);
  assert.throws(()=>validateBackupReceipt({...report,mediaCount:-1}));
});
