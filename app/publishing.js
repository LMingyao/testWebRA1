import { escapeHTML as e, workPhotos, currentYear } from './shared.js';
import { collections, defaultCollection, siteSettings } from './config.js';
import { pageMetadata, categoryPages, categoryURL } from './metadata.js';
import { arrowIcon } from './icons.js';
import { photoImage } from './images.js';
import { editorialHTML } from './editorial.js';
export function publishedContent(data) {
  const content = structuredClone(data);
  content.photos = content.photos.filter(p => p.published && content.categories.some(c => c.id === p.category && c.visible !== false));
  if (content.collections?.photoOrder) {
    const ids = new Set(content.photos.map(p => p.id));
    for (const key of Object.keys(content.collections.photoOrder))
      content.collections.photoOrder[key] = content.collections.photoOrder[key].filter(id => ids.has(id));
  }
  if (content.collections?.photoLayout) {
    const ids = new Set(content.photos.map(p => p.id));
    for (const layout of Object.values(content.collections.photoLayout))
      for (const id of Object.keys(layout)) if (!ids.has(id)) delete layout[id];
  }
  return content;
}
export function publicationEntries(data) {
  const entries = [['index.html','portfolio',defaultCollection(data)]];
  entries.push(['selected.html','portfolio','all']);
  entries.push(['about_me.html','about','all'],['contact.html','contact','all']);
  for (const [id, file] of Object.entries(categoryPages)) entries.push([file,'portfolio',id]);
  for (const category of data.categories) if (!Object.hasOwn(categoryPages,category.id))
    entries.push([`collection-${category.id}.html`,'portfolio',category.id]);
  return entries;
}
export function renderPublishedPage(template, content, page, category, {prerender = true, home = false} = {}) {
  const site = siteSettings(content.site), metadata = pageMetadata(content,page,category);
  let html = template.replaceAll('{{page}}',page).replaceAll('{{title}}',e(metadata.title))
    .replaceAll('{{description}}',e(metadata.description)).replaceAll('{{canonical}}',e(metadata.canonical))
    .replaceAll('{{previousArrow}}',arrowIcon(-1)).replaceAll('{{nextArrow}}',arrowIcon(1));
  if (!home) html = html.replace(/<a class="legacy-link"[^>]*>Legacy views<\/a>/, '');
  html = html.replace('MINGYAO</span',`${e(site.brandName)}</span`).replace('Photography</span',`${e(site.brandTitle)}</span`)
    .replace('aria-label="Mingyao Photography home"',`aria-label="${e(site.name)} ${e(site.brandTitle)} home"`)
    .replace('WORK <span',`${e(site.workLabel)} <span`)
    .replace('data-nav="about">ABOUT',`data-nav="about"${site.showAbout?'':' hidden'}>${e(site.aboutLabel)}`)
    .replace('data-nav="contact">CONTACT',`data-nav="contact"${site.showContact?'':' hidden'}>${e(site.contactLabel)}`)
    .replace('<a class="footer-name" href="index.html">Mingyao Li</a>',`<a class="footer-name" href="index.html">${e(site.name)}</a>`)
    .replace('<small id="copyright"></small',`<small id="copyright">© ${currentYear()} ${e(site.name)}${site.footerText?`. ${e(site.footerText)}`:''}</small`)
    .replace('<div id="social-links"></div>',`<div id="social-links">${site.socials.map((s,i)=>`<a class="social-${i<2?'primary':'secondary'}" href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${e(s.label)} ↗</a>`).join('')}</div>`)
    .replaceAll('mailto:MingyaoLee520@gmail.com',`mailto:${e(site.email)}`);
  html=html.replaceAll('https://mingyaophoto.com/assets/social-card.png',e(metadata.image));
  if (prerender) html=html.replace('<div id="work-menu" hidden></div>',`<div id="work-menu" hidden>${collections(content).map(c=>`<a data-work="${e(c.id)}" href="${e(categoryURL(c.id,content))}"${page === 'portfolio' && c.id === category ? ' aria-current="page"' : ''}>${e(c.label)}</a>`).join('')}</div>`);
  let body;
  if (page === 'about' || page === 'contact') body = editorialHTML(content,page);
  else if (!collections(content).some(c => c.id === category)) {
    body='<section class="error-state"><h1>This collection is no longer available.</h1><a href="index.html">Explore the current collection →</a></section>';
    html=html.replace('<head>','<head><meta name="robots" content="noindex,follow" />');
  } else {
    const sequence=workPhotos(content,category), panoramas=sequence.filter(p=>p.placement==='hero'), photos=sequence.filter(p=>p.placement!=='hero');
    const label=collections(content).find(c=>c.id===category)?.label || 'Selected work';
    body=`<section class="work-gallery" aria-label="${e(label)}"><h1 class="sr-only">${e(label)}</h1>${panoramas.length?`<div class="work-opening"><div class="opening-image">${photoImage(panoramas[0],{eager:true})}</div></div>`:''}<div class="photo-sheet static-sheet">${photos.map((p,i)=>`<figure class="photo-card">${photoImage(p,{eager:i<2&&!panoramas.length})}</figure>`).join('')}</div>${sequence.length?'':'<p class="empty">New photographs will be added soon.</p>'}</section>`;
    if (prerender) html=html.replace('<div id="layout-controls" class="collection-toolbar"></div>',`<div id="layout-controls" class="collection-toolbar"><p class="collection-label">${e(label)}</p></div>`);
  }
  return html.replace(/<main id="main">[\s\S]*?<\/main>/,prerender ? `<main id="main" data-prerendered>${body}</main>` : '<main id="main"><p class="loading" role="status">Opening the collection…</p></main>');
}
export function publicationFiles(template, data, revision, options = {}) {
  const entries=publicationEntries(data), visible=new Set(collections(data).map(c=>c.id));
  const sitemap=entries.filter(([file,page,category])=>file==='index.html'||(page==='portfolio'?visible.has(category)&&!(file==='selected.html'&&defaultCollection(data)==='all'):siteSettings(data.site)[page==='about'?'showAbout':'showContact']));
  return [...entries.map(([path,page,category])=>({path,content:renderPublishedPage(template,data,page,category,{...options,home:path==='index.html'})})),
    {path:'sitemap.xml',content:`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap.map(([file])=>`<url><loc>https://mingyaophoto.com/${e(file)}</loc></url>`).join('')}</urlset>\n`},
    {path:'content/publication.json',content:JSON.stringify({revision,publishedAt:new Date().toISOString(),pages:entries.map(([file])=>file)})+'\n'}];
}
