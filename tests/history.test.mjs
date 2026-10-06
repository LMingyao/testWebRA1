import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access, readdir} from 'node:fs/promises';
import {renderHistory} from '../tools/build-history.mjs';
import {escapeHTML} from '../app/shared.js';

const root=new URL('../',import.meta.url);
const data=JSON.parse(await readFile(new URL('content/history.json',root),'utf8'));
const html=renderHistory(data);

test('the web archive retains every chapter and paragraph of the English booklet',()=>{
  assert.deepEqual(data.sections.map(s=>s.number),Array.from({length:26},(_,i)=>i+1));
  for(const section of data.sections) {
    assert.ok(html.includes(escapeHTML(section.title)),`Missing title ${section.number}`);
    for(const paragraph of section.paragraphs) assert.ok(html.includes(escapeHTML(paragraph).replaceAll('\n','<br>')),`Missing paragraph ${section.number}`);
    for(const head of section.subheads) {
      assert.ok(html.includes(escapeHTML(head.title)),`Missing subheading ${section.number}`);
      if(head.body)assert.ok(html.includes(escapeHTML(head.body)));
    }
    for(const row of section.table?.rows||[]) {
      const texts=Array.isArray(row)?row:[row.label];
      for(const text of texts)assert.ok(html.includes(escapeHTML(text)),`Missing table text ${section.number}: ${text}`);
    }
  }
  assert.ok(html.includes('History reviewed through 2 October 2026'));
  assert.ok(html.includes('rather than claiming to be screenshots taken in that year'));
});

test('native reading and chapter navigation work without a PDF viewer or script-generated text',()=>{
  assert.match(html,/<main id="main">/);
  assert.match(html,/<html lang="en">/);
  assert.doesNotMatch(html,/<(?:iframe|object|embed)\b|\.pdf(?:"|#)|\/admin\/|\.local\/|C:\\/i);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(match[1]),`Broken anchor ${match[1]}`);
  const visible=html.replace(/<[^>]*>/g,'');
  assert.doesNotMatch(visible,/[\u4e00-\u9fff]|\b[0-9a-f]{40}\b|service_role|github_pat_/);
});

test('archive illustrations exist, retain their dimensions, and do not load on the portfolio',async()=>{
  for(const asset of Object.values(data.assets)) {
    assert.match(asset.src,/^assets\/history\/[a-z0-9-]+\.(?:png|webp)$/);
    await access(new URL(asset.src,root));
    assert.ok(asset.width>0&&asset.height>0);
    if(asset.kind==='logo') {
      const [l,t,r,b]=asset.bounds;
      assert.ok(l>=0&&t>=0&&r<=asset.width&&b<=asset.height&&r>l&&b>t);
    }
  }
  const images=[...html.matchAll(/<img\b[^>]*>/g)].map(m=>m[0]);
  assert.equal(images.filter(img=>!img.includes('loading="lazy"')).length,1);
  for(const image of images)assert.match(image,/alt="[^"]+"/);
  assert.doesNotMatch(await readFile(new URL('tools/page.html',root),'utf8'),/assets\/history|app\/history/);
});

test('the reading page exposes no repository links and all Legacy entries link to it',async()=>{
  assert.doesNotMatch(html,/github\.com|api\.github|Historical records|record-links/i);
  assert.doesNotMatch(JSON.stringify(data),/github\.com|api\.github/i);
  const pages=[...(await readdir(root)).filter(file=>file.endsWith('.html')),'admin/index.html'];
  for(const page of pages) {
    const document=await readFile(new URL(page,root),'utf8');
    for(const link of document.matchAll(/href="([^"]+)"/g))assert.doesNotMatch(link[1],/github\.com/i,`Repository link in ${page}`);
  }
  assert.match(await readFile(new URL('tools/legacy-page.html',root),'utf8'),/href="history.html"/);
  assert.match(await readFile(new URL('app/legacy.js',root),'utf8'),/href="history.html"/);
});
