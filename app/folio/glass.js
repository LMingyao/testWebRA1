import {createLiquidGlass} from './liquid-glass.js';
import {arrowIcon} from '../icons.js';
import {createSceneInk} from './scene-ink.js';
import {createPortfolioLenses} from './portfolio-lenses.js';

const root = document.documentElement;
const folio = root.dataset.edition === 'folio';
let mode='glass', solid=false;
let engine, active=[], queued=false, lastViewX;
const mobile=matchMedia('(max-width:900px)');
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)');
const sceneInk=createSceneInk();
const portfolioLenses=folio ? createPortfolioLenses() : null;
function brandedLogo() {
  const brand = document.querySelector('.site-header .brand');
  if (!brand || brand.querySelector('.glass-brand-mark')) return;
  const mark = document.createElement('img');
  mark.className = 'glass-brand-mark';
  mark.src = '/assets/branding/photography.svg';
  mark.alt = ''; mark.setAttribute('aria-hidden','true');
  mark.width = 167; mark.height = 45;
  brand.append(mark);
}

function desired() {
  if (folio) return [...document.querySelectorAll('.collection-toolbar,.opening-controls button,.single-controls button,.viewer-navigation button,.lightbox-close,#navigation,' + (mobile.matches ? '.menu-toggle' : '#work-menu'))];
  return [...document.querySelectorAll('.site-header,.collection-toolbar,.viewer-navigation,.lightbox-close,' + (mobile.matches ? '#navigation' : '#work-menu'))];
}
function reconcile(force = false) {
  const next = mode === 'glass' ? desired() : [];
  if (!force && next.length === active.length && next.every((item, i) => item === active[i] && item.querySelector(':scope > .lg-optics') && item.querySelector(':scope > .lg-rim'))) return;
  engine?.destroy();
  active.forEach(el => {el.classList.remove('lg-surface'); delete el.dataset.lg; delete el.dataset.lgQuality; delete el.dataset.lgMoving;});
  active = next;
  for (const el of active) {
    el.classList.add('lg-surface');
    const photoArrow = el.matches('.opening-controls button,.single-controls button,.viewer-navigation button');
    const isLens = folio && (photoArrow || el.matches('.menu-toggle,.collection-toolbar') || (el.id === 'navigation' && !mobile.matches));
    if (isLens) el.dataset.lg = 'lens';
    else if (el.classList.contains('site-header')) el.dataset.lg = 'card';
    else if (['work-menu','navigation'].includes(el.id)) el.dataset.lg = 'sheet';
    else el.dataset.lg = 'control';
    if (el.classList.contains('site-header') || el.classList.contains('collection-toolbar')) el.dataset.lgMoving = '';
    if (solid) el.dataset.lgQuality = 'opaque';
  }
  engine = active.length ? createLiquidGlass(document) : undefined;
}
function setLens(group, lens, target, animateFrom) {
  if (!target || !group.clientWidth) return;
  const bounds = group.getBoundingClientRect(), rect = target.getBoundingClientRect();
  const x = rect.left - bounds.left;
  lens.style.setProperty('--lens-w', `${rect.width}px`);
  if (animateFrom !== undefined && !reducedMotion.matches) {
    lens.style.setProperty('--lens-x', `${animateFrom}px`);
    requestAnimationFrame(() => {if(lens.isConnected) lens.style.setProperty('--lens-x', `${x}px`);});
  } else lens.style.setProperty('--lens-x', `${x}px`);
  return x;
}
function navLens(target) {
  const group = document.querySelector('#navigation');
  if (!group || mobile.matches) return;
  let lens = group.querySelector(':scope > .glass-nav-lens');
  if (!lens) {
    lens = document.createElement('span'); lens.className = 'glass-nav-lens'; lens.setAttribute('aria-hidden','true'); group.append(lens);
  }
  setLens(group,lens,target || group.querySelector('a[aria-current="page"],.work-toggle.is-current'));
}
// Rows in this edition fill the shared frame after the original gallery
// planner sets its suggested widths. Keep responsive image selection in sync.
function fitGallerySources() {
  const changes = [];
  for (const image of document.querySelectorAll('.work-opening img[srcset],.photo-sheet img[srcset]')) {
    const rect = image.getBoundingClientRect();
    const ratio = Number(image.getAttribute('width')) / Number(image.getAttribute('height'));
    if (!rect.width || !rect.height || !Number.isFinite(ratio) || ratio <= 0) continue;
    const size = Math.ceil(Math.min(rect.width, rect.height * ratio)) + 'px';
    if (image.sizes !== size) changes.push([image, size]);
  }
  for (const [image, size] of changes) image.sizes = size;
}
function enhance() {
  brandedLogo();
  portfolioLenses?.refresh();
  if (folio) {
    fitGallerySources();
    for (const [stageSelector, controlsSelector] of [['.single-stage','.single-controls'],['.viewer-stage','.viewer-navigation']]) {
      const stage = document.querySelector(stageSelector);
      const controls = document.querySelector(controlsSelector);
      if (!stage || !controls) continue;
      if (controls.parentElement !== stage) stage.append(controls);
      const img = stage.querySelector('img');
      if (img) {
        const aspect = Number(img.getAttribute('width')) / Number(img.getAttribute('height'));
        if (Number.isFinite(aspect) && aspect > 0) stage.style.setProperty('--photo-aspect', aspect);
      }
    }
  }
  const toolbar = document.querySelector('.collection-toolbar');
  const toggle = document.querySelector('.site-header .menu-toggle');
  if (folio && toolbar?.querySelector('.view-controls') && toggle && !toolbar.closest('.gallery-header-actions')) {
    const actions = document.createElement('div');
    actions.className = 'gallery-header-actions';
    toggle.before(actions);
    actions.append(toolbar, toggle, document.querySelector('#navigation'));
  }
  navLens();
  const group = document.querySelector('.view-controls');
  if (group) {
    for (const button of group.querySelectorAll('[data-view]')) {
      button.setAttribute('aria-label',button.dataset.view === 'single' ? 'Single view' : 'Multi view');
      if (folio) button.title = button.getAttribute('aria-label');
      button.dataset.compactLabel=button.dataset.view === 'single' ? 'Single' : 'Multi';
    }
    let lens = group.querySelector('.glass-view-lens');
    const added = !lens;
    if (!lens) {lens=document.createElement('span');lens.className='glass-view-lens';lens.setAttribute('aria-hidden','true');group.prepend(lens);}
    lastViewX = setLens(group,lens,group.querySelector('[aria-pressed="true"]'),added ? lastViewX : undefined);
  }
  if (!folio && toolbar && group) {
    let arrows = toolbar.querySelector('.glass-dock-arrows');
    if (!arrows) {
      arrows = document.createElement('div'); arrows.className = 'glass-dock-arrows'; arrows.setAttribute('role','group'); arrows.setAttribute('aria-label','Photograph navigation');
      arrows.innerHTML = `<button type="button" data-glass-step="-1" aria-label="Previous photograph">${arrowIcon(-1)}</button><button type="button" data-glass-step="1" aria-label="Next photograph">${arrowIcon(1)}</button>`;
      toolbar.append(arrows);
    }
    arrows.hidden = !document.querySelector('.single-controls,.opening-controls');
    for (const button of arrows.querySelectorAll('button')) {
      const prefix = document.querySelector('.single-stage') ? 'single' : 'opening';
      const target = document.querySelector(`.${prefix}-${button.dataset.glassStep === '-1' ? 'previous' : 'next'}`);
      button.disabled = !target || target.disabled;
    }
  }
  sceneInk.refresh();
}
function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {queued=false;enhance();reconcile();});
}
function apply() {
  if (folio) { mode = 'glass'; solid = false; }
  root.dataset.material = mode;
  enhance();reconcile(true);
  // Changing material does not replace the gallery or the current photo.
  requestAnimationFrame(enhance);
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-glass-step]');
  if (!button || mode !== 'glass') return;
  const prefix = document.querySelector('.single-stage') ? 'single' : 'opening';
  document.querySelector(`.${prefix}-${button.dataset.glassStep === '-1' ? 'previous' : 'next'}`)?.click();
});
const nav = document.querySelector('#navigation');
nav?.addEventListener('pointerover', event => {const target=event.target.closest('.work-toggle,#navigation > a');if(target) navLens(target);});
nav?.addEventListener('pointerleave',()=>navLens());
nav?.addEventListener('focusin',event=>{const target=event.target.closest('.work-toggle,#navigation > a');if(target)navLens(target);});
nav?.addEventListener('focusout',()=>navLens());
const observer = new MutationObserver(records => {
  if (records.some(record => record.type === 'attributes' || [...record.addedNodes,...record.removedNodes].some(node => node.nodeType === 1 && !node.matches('.lg-optics,.lg-rim,[data-lg-filters],defs,filter,.glass-nav-lens,.glass-view-lens,.glass-dock-arrows')))) queue();
});
const observe = () => observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current','aria-pressed','aria-expanded','hidden','open']});
observe();
const dimensions = new ResizeObserver(queue);
if(nav) dimensions.observe(nav);
const toolbar = document.querySelector('.collection-toolbar');
if(toolbar) dimensions.observe(toolbar);
mobile.addEventListener('change',()=>{enhance();reconcile(true);});
window.addEventListener('pagehide',()=>{observer.disconnect();dimensions.disconnect();engine?.destroy();sceneInk.pause();});
window.addEventListener('pageshow',event=>{if(event.persisted){sceneInk.resume();observe();if(nav)dimensions.observe(nav);if(toolbar)dimensions.observe(toolbar);enhance();reconcile(true);}});
apply();
