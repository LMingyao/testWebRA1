import { escapeHTML as e, validateContent, currentYear } from './shared.js';
import { loadPublicContent, contentForDisplay } from './backend.js';
import { siteSettings } from './config.js';
import { photoImage } from './images.js';
import { createPhotoViewer, onSwipe } from './viewer.js';
import { legacyCollection, legacyURL, legacyMosaic, legacyAlbum } from './legacy-data.js';
import { bindImageRecovery } from './image-recovery.js';

const main = document.querySelector('main');
const era = document.body.dataset.era;
const query = new URL(location.href).searchParams;
const monochrome = era === '2023' && query.get('edition') === 'bw';
const french = era === '2023' && query.get('lang') === 'fr';
document.body.classList.toggle('monochrome', monochrome);
if (french) document.documentElement.lang = 'fr';
let closePosition, restoreFocus;
const viewer = document.querySelector('.lightbox');
const openPhoto = createPhotoViewer(viewer, () => {}, () => {
  restoreFocus?.focus({preventScroll:true});
  window.scrollTo({top:closePosition,behavior:'instant'});
}, () => { closePosition = window.scrollY; restoreFocus = document.activeElement; });

function wordmark(year) {
  return `<span class="historical-mark mark-${year}"><img src="assets/legacy/wordmark-${year}.png" alt="Mingyao Photography — ${year} wordmark"></span>`;
}
function tile(photo, sizes) {
  return `<figure class="photo-card"><button data-photo="${e(photo.id)}" aria-label="View ${e(photo.alt)}">${photoImage(photo,{sizes})}</button></figure>`;
}
function mosaic(photos) {
  return legacyMosaic(photos).map(column => `<div class="mosaic-column">${column.map(({photo,divisor}) => `<div class="mosaic-tile ${divisor===2?'half':'full'}">${tile(photo,divisor===2?'(max-width:767px) calc(100vw - 48px), 25vw':'(max-width:767px) calc(100vw - 48px), 50vw')}</div>`).join('')}</div>`).join('');
}
function album(photos) {
  return legacyAlbum(photos).map(({width,frames})=>`<div class="album-column" style="--column-width:${width}px">${frames.map(frame=>`<div class="album-frame" style="--frame-width:${frame.width}px;--frame-ratio:${frame.width}/${frame.height}">${tile(frame.photo,`${frame.width}px`)}</div>`).join('')}</div>`).join('');
}
function editionURL(category, bw, fr) {
  return legacyURL('2023',category)+(bw?'&edition=bw':'')+(fr?'&lang=fr':'');
}

try {
  const source = validateContent(await loadPublicContent());
  const fingerprint = JSON.stringify(source);
  const content = contentForDisplay(source), site = siteSettings(content.site);
  const selected = legacyCollection(content, query.get('collection') || '*');
  document.querySelector('#legacy-copyright').textContent = `© ${currentYear()} ${site.name}${site.footerText ? `. ${site.footerText}` : ''}`;
  document.querySelector('#legacy-note').textContent = era ? `${era} design · Current photographs` : 'Historical designs, revisited with today’s collection.';
  document.querySelectorAll('[data-era-link]').forEach(link => {
    const year = link.dataset.eraLink;
    link.href = legacyURL(year, selected.category);
    if (year === era) link.setAttribute('aria-current', 'page');
  });
  const { photos, panoramas, wall } = selected;
  const hero = panoramas[0] || wall[0];
  if (!era) {
    main.innerHTML = `<section class="archive-intro"><p class="archive-eyebrow">MINGYAO / PHOTOGRAPHY</p><h1>A little look back.</h1><p>Two earlier designs. The photographs you see today.</p></section><div class="archive-cards">${['2022','2023'].map(year => `<a class="archive-card era-${year}" href="${e(legacyURL(year,selected.category))}"><div class="archive-card-brand">${wordmark(year)}</div>${hero ? photoImage(hero,{eager:true,sizes:'(max-width:700px) calc(100vw - 40px), 550px'}) : '<div class="archive-placeholder"></div>'}<div class="archive-card-caption"><span>${year}</span><span>${year === '2022' ? 'The blue beginning' : 'The white portfolio'} →</span></div></a>`).join('')}</div><section class="archive-story"><p class="archive-eyebrow">2022–2026 / THE WEBSITE CHRONICLE</p><h2>A photographic identity, over time.</h2><p>The original marks, the earlier pages, and the small decisions that connect them to the portfolio today.</p><a href="history.html">Read the illustrated history →</a></section>`;
  } else {
    // Archive controls live below the reproduction rather than changing its opening.
    document.querySelector('.archive-bar').remove();
    const brands = era === '2022'
      ? `<a class="historical-brand" href="#home">${wordmark('2022')}</a>`
      : `<div class="historical-brands"><a href="${e(editionURL(selected.category,false,french))}">${wordmark('2023')}</a><a href="${e(editionURL(selected.category,true,french))}" aria-label="Black and white edition">${wordmark('2023-bw')}</a></div>`;
    const nav = era === '2022' ? '<a href="#home">Home</a><a href="#photographs">Gallery</a>'
      : `<a href="#photographs">PORTFOLIO</a>${site.showAbout ? `<a href="about_me.html">${french?'À PROPOS':'ABOUT ME'}</a>` : ''}${site.showContact ? '<a href="contact.html">CONTACT</a>' : ''}<a class="historical-language" href="${e(editionURL(selected.category,monochrome,!french))}" aria-label="${french?'Switch to English':'Passer en français'}"><img src="assets/legacy/language-2023.png" alt="EN/FR"></a>`;
    const opening = panoramas.length ? `<section class="legacy-opening work-opening" aria-label="Opening photographs"><button class="legacy-hero" aria-label="Open photograph"></button>${era==='2022'?'<div class="legacy-hero-controls"><button class="hero-prev" aria-label="Previous photograph"><img src="assets/legacy/previous-2022.png" alt=""></button><button class="hero-next" aria-label="Next photograph"><img src="assets/legacy/next-2022.png" alt=""></button></div>':''}</section>` : '';
    const historicalIcons = ['facebook','instagram','twitter','linkedin','jetphotos'];
    const socialHTML = site.socials.map(s=>{
      const name=s.label.toLowerCase().replaceAll(' ','');
      const icon=historicalIcons.find(icon=>icon===(name==='x'?'twitter':name));
      return `<a href="${e(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${e(s.label)}">${icon?`<img src="assets/legacy/social-${icon}.svg" alt="">`:e(s.label)}</a>`;
    }).join('');
    main.innerHTML = `<div id="home" class="historical-site ${panoramas.length?'has-opening':''}"><header class="historical-header">${brands}<button class="historical-menu" aria-label="Toggle navigation" aria-expanded="false">☰</button><nav aria-label="Portfolio navigation">${nav}</nav></header>${opening}<section id="photographs" class="legacy-wall ${era==='2022'?'legacy-album':'legacy-mosaic'}" aria-label="Photographs">${wall.length?(era==='2022'?album(wall):mosaic(wall)):'<p class="empty">No gallery photographs in this collection yet.</p>'}</section><footer class="historical-footer">${era==='2022'?'<p>Tous Droits Réservés</p>':`<div class="historical-socials">${socialHTML}</div><p>Copyright © ${currentYear()} ${e(site.name)} - All Rights Reserved</p>`}</footer></div>`;
    const controls = document.createElement('div');
    controls.className='legacy-collection';
    controls.innerHTML = `<label for="collection">Collection</label><select id="collection">${selected.collections.map(item=>`<option value="${e(item.id)}" ${item.id===selected.category?'selected':''}>${e(item.label)}</option>`).join('')}</select><button class="legacy-playback" aria-pressed="false">Pause slides</button><nav aria-label="Legacy views"><a href="legacy.html">Legacy views</a><a href="${e(legacyURL('2022',selected.category))}">2022</a><a href="${e(legacyURL('2023',selected.category))}">2023</a></nav>`;
    document.querySelector('.legacy-footer').prepend(controls);
    document.querySelector('#collection').onchange = event => location.assign(era==='2023'?editionURL(event.target.value,monochrome,french):legacyURL(era,event.target.value));
    main.querySelectorAll('[data-photo]').forEach(button => {
      button.onclick = () => openPhoto(photos,photos.findIndex(photo=>photo.id===button.dataset.photo));
    });
    const menuButton=document.querySelector('.historical-menu');
    menuButton.onclick=()=>{const expanded=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(expanded));document.querySelector('.historical-header').classList.toggle('menu-open',expanded);};
    let advanceHero=()=>{};
    if (panoramas.length) {
      let current=0;
      const host=document.querySelector('.legacy-hero');
      const show=()=>{host.innerHTML=photoImage(panoramas[current],{eager:true,sizes:era==='2022'?'100vw':'calc(100vw - 160px)'});};
      advanceHero=direction=>{current=(current+direction+panoramas.length)%panoramas.length;show();};
      host.onclick=()=>openPhoto(photos,photos.findIndex(photo=>photo.id===panoramas[current].id));
      document.querySelectorAll('.hero-prev,.hero-next').forEach(button=>{button.disabled=panoramas.length<2;button.onclick=()=>advanceHero(button.classList.contains('hero-prev')?-1:1);});
      onSwipe(host,advanceHero);show();
    }
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    let paused=motion.matches, heroTimer, albumTimer;
    const playback=document.querySelector('.legacy-playback');
    const albumHost=document.querySelector('.legacy-album');
    function syncPlayback() {
      clearInterval(heroTimer);clearInterval(albumTimer);
      playback.textContent=paused?'Play slides':'Pause slides';playback.setAttribute('aria-pressed',String(paused));
      if(paused || document.visibilityState!=='visible' || viewer.open)return;
      if(panoramas.length>1)heroTimer=setInterval(()=>advanceHero(1),5000);
      if(albumHost && albumHost.scrollWidth>albumHost.clientWidth)albumTimer=setInterval(()=>{
        const column=albumHost.querySelector(innerWidth<1024?'.photo-card':'.album-column');
        if(albumHost.scrollLeft+albumHost.clientWidth>=albumHost.scrollWidth-2)albumHost.scrollTo({left:0,behavior:'smooth'});
        else albumHost.scrollBy({left:column?.clientWidth||300,behavior:'smooth'});
      },3000);
    }
    playback.hidden=panoramas.length<2 && era!=='2022';
    playback.onclick=()=>{paused=!paused;syncPlayback();};
    document.addEventListener('visibilitychange',syncPlayback);
    viewer.addEventListener('close',syncPlayback);
    new MutationObserver(syncPlayback).observe(viewer,{attributes:true,attributeFilter:['open']});
    motion.addEventListener('change',()=>{paused=motion.matches;syncPlayback();});
    window.addEventListener('resize',syncPlayback);
    if(albumHost) {
      // Keep the old grab-to-browse interaction without its slider dependency.
      let drag=null, suppressClick=false;
      albumHost.querySelectorAll('img').forEach(image=>image.draggable=false);
      albumHost.addEventListener('pointerdown',event=>{
        if(event.pointerType==='mouse' && event.button===0)drag={id:event.pointerId,x:event.clientX,left:albumHost.scrollLeft};
      });
      albumHost.addEventListener('pointermove',event=>{
        if(!drag || event.pointerId!==drag.id)return;
        const delta=event.clientX-drag.x;
        if(Math.abs(delta)<6 && !suppressClick)return;
        suppressClick=true;albumHost.setPointerCapture(event.pointerId);event.preventDefault();albumHost.scrollLeft=drag.left-delta;
      });
      const endDrag=()=>{drag=null;setTimeout(()=>{suppressClick=false;},0);};
      albumHost.addEventListener('pointerup',endDrag);
      albumHost.addEventListener('pointercancel',endDrag);
      albumHost.addEventListener('pointerleave',()=>{if(!suppressClick)drag=null;});
      albumHost.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();}},{capture:true});
    }
    syncPlayback();bindImageRecovery(main);
  }
  let lastCheck = Date.now(), checking = false;
  async function checkForUpdates() {
    if (checking || document.visibilityState !== 'visible' || Date.now()-lastCheck<30000 || document.querySelector('.legacy-refresh')) return;
    checking = true;lastCheck=Date.now();
    try {
      if (JSON.stringify(validateContent(await loadPublicContent())) !== fingerprint) {
        const message = document.createElement('p');message.className='legacy-refresh';message.setAttribute('role','status');
        message.textContent='The collection has been updated. ';
        const refresh = document.createElement('button');refresh.textContent='Refresh';refresh.onclick=()=>location.reload();message.append(refresh);document.querySelector('.legacy-footer').prepend(message);
      }
    } catch { /* Retain the open view without substituting an older public snapshot. */ }
    finally { checking=false; }
  }
  document.addEventListener('visibilitychange',checkForUpdates);
  window.addEventListener('focus',checkForUpdates);
  window.addEventListener('pageshow',checkForUpdates);
} catch (error) {
  main.innerHTML = '<section class="archive-intro"><h1>The collection is taking a moment.</h1><p>Please try again shortly.</p><button id="retry">Try again</button></section>';
  document.querySelector('#retry').onclick=()=>location.reload();
  console.error(error);
}
