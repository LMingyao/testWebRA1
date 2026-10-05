import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { fixture } from './fixture.mjs';
import { orderedPhotos, moveVisible, reorderVisible, setComposition } from '../app/sequence.js';
import { validateContent, workPhotos, contentImagePaths } from '../app/shared.js';
import { publishedContent, publicationFiles } from '../app/publishing.js';
import { createBackup, verifyBackup } from '../tools/backup.mjs';
import { seedSQL } from '../tools/prepare-d1.mjs';

test('filtered moves skip invisible neighbours and collection edits leave other sequences unchanged',()=>{
  const data=structuredClone(fixture);
  data.categories.push({id:'travel',label:'Travel'});
  const middle={...data.photos[0],id:'middle',category:'travel'};
  data.photos.splice(1,0,middle);
  assert.equal(moveVisible(data,['photo-one','photo-two'],'photo-two',-1,'aviation'),true);
  assert.deepEqual(workPhotos(data,'aviation').map(p=>p.id),['photo-two','photo-one']);
  assert.deepEqual(workPhotos(data,'all').map(p=>p.id),['photo-one','middle','photo-two']);
  assert.deepEqual(data.photos.map(p=>p.id),['photo-one','middle','photo-two']);
  moveVisible(data,['photo-one','photo-two'],'photo-two',1,'aviation');
  assert.deepEqual(workPhotos(data,'aviation').map(p=>p.id),['photo-one','photo-two']);
  reorderVisible(data,['photo-one','photo-two'],'photo-two','photo-one',false,'all');
  assert.deepEqual(orderedPhotos(data,'all').filter(p=>p.category==='aviation').map(p=>p.id),['photo-two','photo-one']);
  assert.deepEqual(workPhotos(data,'aviation').map(p=>p.id),['photo-one','photo-two']);
  assert.equal(validateContent(data),data);
  data.photos[0].published=false;
  assert.equal(validateContent(publishedContent(data)).photos.length,2);
});

test('successive snapshots contain current text, visible links, real photos and matching sharing metadata',async()=>{
  const template=await readFile(new URL('../tools/page.html',import.meta.url),'utf8'), data=structuredClone(fixture);
  data.site.email='first@example.com';data.site.shareImage=data.photos[0].image;
  data.categories.push({id:'travel',label:'Travel',visible:true});
  data.collections={default:'travel'};
  let files=publicationFiles(template,publishedContent(data),'one');
  const page=file=>files.find(f=>f.path===file).content;
  assert.match(page('index.html'),/Travel/);
  assert.match(page('selected.html'),/<img /);
  assert.match(page('contact.html'),/first@example.com/);
  assert.match(page('sitemap.xml'),/collection-travel.html/);
  assert.match(page('contact.html'),/og:image" content="https:\/\/mingyaophoto.com\/assets\/one.jpg/);
  data.site.email='second@example.com';data.categories[1].visible=false;data.collections.default='all';data.photos[0].published=false;
  files=publicationFiles(template,publishedContent(data),'two');
  assert.match(page('contact.html'),/second@example.com/);
  assert.doesNotMatch(page('sitemap.xml'),/collection-travel.html/);
  assert.match(page('collection-travel.html'),/noindex/);
  assert.doesNotMatch(page('index.html'),/alt="A plane in flight"/);
  assert.equal(JSON.parse(page('content/publication.json')).revision,'two');
  const unverified=publicationFiles(template,data,'unverified',{prerender:false}).find(f=>f.path==='index.html').content;
  assert.doesNotMatch(unverified,/<main[^>]*>[\s\S]*?<img/);
  assert.match(unverified,/Opening the collection/);
  data.categories = []; data.photos = [];
  files=publicationFiles(template,data,'three');
  assert.match(page('aviation.html'),/noindex/);
  assert.match(page('selected.html'),/Selected work/);
});

test('collection composition does not alter another collection or the library and hidden references are pruned',()=>{
  const data=structuredClone(fixture);
  setComposition(data,['photo-one'],'solo','Editorial','all');
  assert.equal(workPhotos(data,'all')[0].presentation,'solo');
  assert.notEqual(workPhotos(data,'aviation')[0].presentation,'solo');
  assert.equal(data.photos[0].group,undefined);
  validateContent(data);
  data.photos[0].published=false;
  const visible=publishedContent(data);
  assert.equal(Object.hasOwn(visible.collections.photoLayout.all,'photo-one'),false);
  data.collections.photoLayout.all.unknown={presentation:'auto',group:''};
  assert.throws(()=>validateContent(data));
});

test('complete backup verifies checksums and reconstructs ordered content and history in an empty database',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'gallery-backup-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const bytes=Buffer.from('photo bytes'), hash=createHash('sha256').update(bytes).digest('hex');
  const manifest={format:'gallery-backup-v1',data:structuredClone(fixture),revision:'current',mediaBase:'https://example.com/',
    history:[{revision:'older',data:{...structuredClone(fixture),site:{...fixture.site,email:'old@example.com'}},savedAt:'2026-10-01 12:00:00'}],
    media:[...contentImagePaths(fixture)].map(path=>({path,bytes:bytes.length,digest:hash}))};
  await createBackup(manifest,directory,async()=>new Response(bytes));
  assert.deepEqual((await verifyBackup(directory)).data,fixture);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(await readFile(new URL('../cloudflare/migrations/0001_gallery.sql',import.meta.url),'utf8'));
  db.exec(await readFile(path.join(directory,'restore-content.sql'),'utf8'));
  assert.deepEqual(JSON.parse(db.prepare('SELECT document FROM gallery_content').get().document),fixture);
  assert.equal(JSON.parse(db.prepare('SELECT document FROM gallery_history').get().document).site.email,'old@example.com');
  await writeFile(path.join(directory,'assets/one.jpg'),'tampered');
  await assert.rejects(()=>verifyBackup(directory),/checksum/);
});
