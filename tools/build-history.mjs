import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { escapeHTML as e } from '../app/shared.js';

const brand = '<span class="brand"><span class="logo-wordmark"><span class="logo-name">MINGYAO</span><span class="logo-title">Photography</span></span></span>';
const groups = [
  {id:'year-2022',year:'2022',title:'The image comes first.',pages:[4,5,6]},
  {id:'year-2023',year:'2023',title:'A white portfolio finds its mark.',pages:[7,8,9,10,11,12]},
  {id:'year-2024',year:'2024',title:'The gradient becomes the signature.',pages:[13,14,15,16]},
  {id:'year-2025',year:'2025',title:'A recognisable design is carried forward.',pages:[17,18]},
  {id:'year-2026',year:'2026',title:'The same identity, more deliberately framed.',pages:[20,21,22,23,24]},
];
function logo(key, data) {
  if(key==='current') return `<div class="atlas-wordmark">${brand}</div>`;
  if(!key) return '<div class="atlas-name">MINGYAO LI</div>';
  const asset=data.assets[key];
  const [l,t,r,b]=asset.bounds, width=r-l, height=b-t;
  const style=`aspect-ratio:${width}/${height};--logo-width:${asset.width/width*100}%;--logo-height:${asset.height/height*100}%;--logo-left:${-l/width*100}%;--logo-top:${-t/height*100}%`;
  return `<span class="archive-logo" style="${style}"><img src="${e(asset.src)}" width="${asset.width}" height="${asset.height}" alt="${e(key.replaceAll('-',' '))} original wordmark" loading="lazy" decoding="async"></span>`;
}
function illustration(figure,data) {
  const asset=data.assets[figure.asset];
  if(asset.kind==='logo')return `<figure class="story-figure logo-figure ${figure.asset==='signature-2022'?'navy':''}"><div class="logo-mat">${logo(figure.asset,data)}</div><figcaption>${e(figure.caption)}</figcaption></figure>`;
  return `<figure class="story-figure"><a class="archive-image" href="${e(asset.src)}" target="_blank" rel="noopener noreferrer" aria-label="Inspect image: ${e(figure.alt)}"><img src="${e(asset.src)}" width="${asset.width}" height="${asset.height}" loading="lazy" decoding="async" alt="${e(figure.alt)}"></a><figcaption>${e(figure.caption)} <a href="${e(asset.src)}" target="_blank" rel="noopener noreferrer">Inspect image ↗</a></figcaption></figure>`;
}
function table(section,data) {
  const table=section.table;if(!table)return '';
  if(table.kind==='cards')return `<div class="identity-atlas">${table.rows.map(row=>`<figure><div class="identity-mat ${row.asset==='signature-2022'?'navy':''}">${logo(row.asset,data)}</div><figcaption>${e(row.label)}</figcaption></figure>`).join('')}</div>`;
  if(table.kind==='rows')return `<div class="inheritance-grid"><div class="inheritance-labels"><span>Inherited idea</span><span>Earlier evidence</span><span>Present expression</span></div>${table.rows.map(([idea,old,now])=>`<div class="inheritance-row"><h3>${e(idea)}</h3><p><span class="mobile-label">Earlier</span>${e(old)}</p><p><span class="mobile-label">Present</span>${e(now)}</p></div>`).join('')}</div>`;
  return `<div class="story-points">${table.rows.map(row=>`<div><p class="point-kicker">${e(row[0])}</p>${row.length===3?`<h4>${e(row[1])}</h4><p>${e(row[2])}</p>`:`<p>${e(row[1])}</p>`}</div>`).join('')}</div>`;
}
function article(section,data,{id=`story-${section.number}`,wide=false}={}) {
  const illustrated=section.figures.length>0;
  const body=section.paragraphs.map((paragraph,index)=>`${section.subheads[index]?.title&&!section.subheads[index]?.body?`<h4>${e(section.subheads[index].title)}</h4>`:''}<p>${e(paragraph).replaceAll('\n','<br>')}</p>`).join('');
  const notes=section.notes.map(note=>`<p class="archive-note">${e(note)}</p>`).join('');
  const callouts=section.subheads.filter(head=>head.body).map(head=>`<div><h4>${e(head.title)}</h4><p>${e(head.body)}</p></div>`).join('');
  return `<article id="${e(id)}" class="story-article ${wide?'wide':''}"><header><p class="eyebrow">${e(section.kicker)}</p><h3>${e(section.title)}</h3>${section.deck?`<p class="story-deck">${e(section.deck)}</p>`:''}</header>${section.number===21?`<div class="baseline-study">${brand}</div>`:''}<div class="story-content ${illustrated?'illustrated':''}">${illustrated?`<div class="story-visuals ${section.figures.length===2?'paired':''}">${section.figures.map(figure=>illustration(figure,data)).join('')}</div>`:''}<div class="story-copy">${body}${table(section,data)}${callouts?`<aside class="archive-callouts">${callouts}</aside>`:''}</div></div>${notes}</article>`;
}

export function renderHistory(data) {
  const byNumber=new Map(data.sections.map(section=>[section.number,section]));
  const navigation=[...groups.map(group=>[group.id,group.year]),['identity','Wordmarks'],['inheritance','Continuity']];
  const timeline=byNumber.get(3);
  const chronology=timeline.table.rows.map(([year,title,body])=>`<a href="#year-${e(year)}"><span>${e(year)}</span><h3>${e(title)}</h3><p>${e(body)}</p></a>`).join('');
  const chapters=groups.map(group=>`<section id="${group.id}" class="year-chapter" aria-labelledby="${group.id}-title"><header class="year-heading"><p>${group.year}</p><h2 id="${group.id}-title">${e(group.title)}</h2>${group.year==='2022'||group.year==='2023'?`<a href="legacy-${group.year}.html">Explore the ${group.year} view →</a>`:''}</header>${group.pages.map(number=>article(byNumber.get(number),data)).join('')}</section>`).join('');
  const cover=data.assets['opening-2026'];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><meta name="description" content="The illustrated design history of Mingyao Photography, from its first page in 2022 to the contemporary portfolio."><title>The Website Chronicle · Mingyao Photography</title><link rel="icon" href="assets/favicon.svg"><link rel="stylesheet" href="app/design.css"><link rel="stylesheet" href="app/wordmark.css"><link rel="stylesheet" href="app/history.css"><script type="module" src="app/history.js"></script></head>
<body><a class="skip-link" href="#main">Skip to the story</a><header class="history-header"><a href="index.html" aria-label="Mingyao Photography home">${brand}</a><nav aria-label="Archive navigation"><a href="legacy.html">Legacy views</a><a href="index.html">Current portfolio ↗</a></nav></header>
<main id="main"><section class="history-cover"><p class="eyebrow">MINGYAO / PHOTOGRAPHY · THE WEBSITE CHRONICLE</p><div class="cover-title"><h1>${e(data.title)}</h1><p>2022<br><span>—</span>2026</p></div><p class="cover-deck">${e(byNumber.get(1).paragraphs[0])}</p><div class="cover-meta"><span>English edition · Front-end design & identity</span><span>History reviewed through ${e(data.reviewedThrough)}</span></div><figure class="cover-figure"><img src="${e(cover.src)}" width="${cover.width}" height="${cover.height}" alt="${e(byNumber.get(1).figures[0].alt)}" fetchpriority="high" decoding="async"><figcaption>A photographic website, and the small decisions that made it its own.</figcaption></figure></section>
<nav class="chapter-nav" aria-label="Jump to a chapter"><a href="#beginning">Introduction</a>${navigation.map(([id,label])=>`<a href="#${id}">${label}</a>`).join('')}</nav>
${article(byNumber.get(2),data,{id:'beginning',wide:true})}<section class="chronology"><p class="eyebrow">CHRONOLOGY</p><h2>${e(timeline.title)}</h2><p>${e(timeline.deck)}</p><div>${chronology}</div><p class="archive-note">${e(timeline.notes[0])}</p></section>
${chapters}<section id="identity" class="reference-section"><p class="eyebrow">IDENTITY ATLAS</p><h2>${e(byNumber.get(19).title)}</h2><p>${e(byNumber.get(19).deck)}</p>${table(byNumber.get(19),data)}<p class="archive-note">${e(byNumber.get(19).notes[0])}</p></section>
<section id="inheritance" class="reference-section"><p class="eyebrow">DESIGN INHERITANCE</p><h2>${e(byNumber.get(25).title)}</h2><p>${e(byNumber.get(25).deck)}</p>${table(byNumber.get(25),data)}<p class="archive-note">${e(byNumber.get(25).notes[0])}</p></section>
${article(byNumber.get(26),data,{id:'carried-forward',wide:true})}</main>
<footer class="history-footer"><p>A continuing photographic identity.</p><nav aria-label="Continue exploring"><a href="legacy.html">Legacy views →</a><a href="index.html">Return to the portfolio →</a><a href="#main">Back to the beginning ↑</a></nav><small>Historical archive · English web edition · ${e(data.reviewedThrough)}</small></footer></body></html>\n`;
}
export async function buildHistory(root) {
  const data=JSON.parse(await readFile(path.join(root,'content/history.json'),'utf8'));
  for(const asset of Object.values(data.assets))await access(path.join(root,asset.src));
  await writeFile(path.join(root,'history.html'),renderHistory(data));
}
