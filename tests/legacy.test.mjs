import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { legacyCollection, legacyURL, legacyMosaic, legacyAlbum } from '../app/legacy-data.js';
import { publishedContent, publicationFiles } from '../app/publishing.js';
import { readFile } from 'node:fs/promises';

test('legacy views follow successive visibility, selection and default changes', () => {
  const data = structuredClone(fixture);
  data.photos[0].placement = 'hero';
  data.photos[1].published = true;
  data.photos[1].homeSelected = true;
  data.categories.push({id:'travel',label:'Travel'});
  data.photos.push({...data.photos[1],id:'travel-one',category:'travel'});
  data.collections = {default:'aviation',photoOrder:{aviation:['photo-two','photo-one']}};
  let view = legacyCollection(publishedContent(data));
  assert.equal(view.category,'aviation');
  assert.deepEqual(view.panoramas.map(p=>p.id),['photo-one']);
  assert.deepEqual(view.wall.map(p=>p.id),['photo-two']);
  assert.ok(!view.wall.some(p=>view.panoramas.some(hero=>hero.id===p.id)));
  data.photos[1].published = false;
  view = legacyCollection(publishedContent(data),'aviation');
  assert.deepEqual(view.wall,[]);
  data.photos[1].published = true;
  data.photos[1].homeSelected = false;
  assert.deepEqual(legacyCollection(publishedContent(data),'all').wall.map(p=>p.id),['travel-one']);
  assert.deepEqual(legacyCollection(publishedContent(data),'aviation').wall.map(p=>p.id),['photo-two']);
  data.categories[0].visible = false;
  data.collections.default = 'travel';
  view = legacyCollection(publishedContent(data),'aviation');
  assert.equal(view.category,'travel');
  assert.ok(!view.collections.some(c=>c.id==='aviation'));
  assert.deepEqual(view.photos.map(p=>p.id),['travel-one']);
});

test('legacy photo walls follow the active collection order', () => {
  const data = structuredClone(fixture);
  data.photos[1].published = true;
  data.collections = {default:'aviation',photoOrder:{aviation:['photo-two','photo-one']}};
  assert.deepEqual(legacyCollection(publishedContent(data)).wall.map(p=>p.id),['photo-two','photo-one']);
  data.collections.photoOrder.aviation.reverse();
  assert.deepEqual(legacyCollection(publishedContent(data)).wall.map(p=>p.id),['photo-one','photo-two']);
});

test('switching era preserves collection identity in a bounded legacy URL', () => {
  assert.equal(legacyURL('2022','travel'),'legacy-2022.html?collection=travel');
  assert.equal(legacyURL('2023','all'),'legacy-2023.html?collection=all');
  assert.equal(legacyURL('unknown','all'),'legacy.html?collection=all');
  assert.equal(legacyURL('2022','a&b'),'legacy-2022.html?collection=a%26b');
});

test('the complete retrospective excludes unpublished photos and hidden categories after changes', () => {
  const data=structuredClone(fixture);
  data.photos[1].published=false;
  assert.deepEqual(legacyCollection(data,'*').photos.map(p=>p.id),['photo-one']);
  data.photos[1].published=true;data.photos[1].homeSelected=false;
  assert.deepEqual(legacyCollection(data,'*').photos.map(p=>p.id),['photo-one','photo-two']);
  data.categories[0].visible=false;
  assert.deepEqual(legacyCollection(data,'*').photos,[]);
});

test('historical mosaic repeats the original six columns without dropping or duplicating photos', () => {
  const photos=Array.from({length:53},(_,i)=>({id:String(i)}));
  const columns=legacyMosaic(photos);
  assert.deepEqual(columns.slice(0,6).map(c=>c.map(t=>t.divisor)),[[2,2,1],[1,2,2,2,2],[1,2,2,2,2],[2,2,1],[2,2,1],[1,2,2,2,2]]);
  assert.deepEqual(columns.flatMap(c=>c.map(t=>t.photo)),photos);
  assert.deepEqual(legacyMosaic([]),[]);
  assert.equal(legacyMosaic(photos.slice(0,1)).flat().length,1);
});

test('only the homepage receives the Legacy views entry, including after default changes', async () => {
  const template=await readFile(new URL('../tools/page.html',import.meta.url),'utf8');
  const data=structuredClone(fixture);
  for (const selected of ['all','aviation']) {
    data.collections={default:selected};
    const files=publicationFiles(template,publishedContent(data),'test');
    const matches=files.filter(file=>file.path.endsWith('.html') && file.content.includes('class="legacy-link"'));
    assert.deepEqual(matches.map(file=>file.path),['index.html']);
  }
});

test('historical album retains original variable dimensions and accepts an odd final photo', () => {
  const photos=Array.from({length:15},(_,i)=>({id:String(i)}));
  const columns=legacyAlbum(photos);
  assert.deepEqual(columns.map(column=>column.width),[450,450,1150,600,600,572,600,450]);
  assert.deepEqual(columns.flatMap(column=>column.frames.map(frame=>frame.photo)),photos);
  assert.equal(columns.at(-1).frames.length,1);
  assert.deepEqual(legacyAlbum([]),[]);
});
