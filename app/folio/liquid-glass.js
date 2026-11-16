// Scoped extraction of the independently written Mingyao Works edge-only renderer.
// No business state, selection suppression or brand assets. See references/rendering.md.
let instanceSerial = 0;
export function createLiquidGlass(root = document) {
const surfaceSelector = '.lg-surface[data-lg]';
const surfaces = [...root.querySelectorAll(surfaceSelector)];
if (root.matches?.(surfaceSelector)) surfaces.unshift(root);
const ownedLayers = [];
const lightFrames = new Set();
const abort = new AbortController();
let destroyed = false;
const prefix = `lg-${instanceSerial++}-`;
function listen(target,type,fn,options={}) {target.addEventListener(type,fn,{...options,signal:abort.signal});}
const ns = 'http://www.w3.org/2000/svg';
const reduceTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
const forcedColors = matchMedia('(forced-colors: active)');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const coarsePointer = matchMedia('(pointer: coarse)');
// WebKit/Firefox accept some filter syntax without rendering SVG backdrop filters.
// Their CSS clear-glass fallback does not claim to provide native refraction.
const nativeRefraction = /Chrome|Chromium|Edg\//.test(navigator.userAgent) && !/CriOS/.test(navigator.userAgent);
const profiles = {
  panel: {band:28, strength:24},
  sheet: {band:16, strength:32},
  card: {band:12, strength:28},
  control: {band:9, strength:20},
  lens: {band:10, strength:38},
};
const maxMapPixels = 262144;
const maxMapDimension = 1024;
const cache = new Map();
const states = new Map();
const pending = new Set();
let filterSerial = 0;
let updateFrame = 0;
const svg = document.createElementNS(ns, 'svg');
svg.setAttribute('aria-hidden', 'true');
svg.dataset.lgFilters = prefix;
svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
svg.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden';
const defs = document.createElementNS(ns, 'defs');
svg.append(defs);
if (surfaces.length && nativeRefraction) document.body.append(svg);

function element(name, attributes) {
  const el = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
  return el;
}

function directChild(parent, className) {
  return [...parent.children].find(child => child.classList.contains(className));
}

function materialHost(surface) { return surface; }
function profileFor(surface) {return Object.hasOwn(profiles,surface.dataset.lg) ? surface.dataset.lg : 'control';}

function releaseFilter(state) {
  const entry = cache.get(state.filterKey);
  if (entry && --entry.references === 0) {
    entry.filter.remove();
    cache.delete(state.filterKey);
  }
  state.filterKey = null;
}

function clearOptics(state) {
  state.optics.dataset.optics = 'clear';
  state.optics.style.removeProperty('--glass-filter');
  releaseFilter(state);
}

function filterFor(width, height, radius, profileName) {
  const key = `${width}:${height}:${radius}:${profileName}`;
  if (cache.has(key)) return cache.get(key);
  // A tall detail panel must not allocate a full-resolution page-sized PNG.
  // Sample in CSS coordinates so the optical edge keeps its intended thickness.
  const density = Math.min(1, maxMapDimension / width, maxMapDimension / height,
    Math.sqrt(maxMapPixels / (width * height)));
  const mapWidth = Math.max(1, Math.floor(width * density));
  const mapHeight = Math.max(1, Math.floor(height * density));
  const canvas = document.createElement('canvas');
  canvas.width = mapWidth; canvas.height = mapHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const pixels = ctx.createImageData(mapWidth, mapHeight);
  const {band:profileBand, strength} = profiles[profileName];
  const band = Math.min(profileBand, width / 2, height / 2);
  for (let y = 0; y < mapHeight; y++) for (let x = 0; x < mapWidth; x++) {
    const px = (x + .5) * width / mapWidth - width / 2;
    const py = (y + .5) * height / mapHeight - height / 2;
    const qx = Math.abs(px) - (width / 2 - radius), qy = Math.abs(py) - (height / 2 - radius);
    const ax = Math.max(qx, 0), ay = Math.max(qy, 0), length = Math.hypot(ax, ay);
    const depth = radius - length - Math.min(Math.max(qx, qy), 0);
    let nx = 0, ny = 0;
    if (length > 0) { nx = ax / length * Math.sign(px); ny = ay / length * Math.sign(py); }
    else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
    // Bell profile is neutral at the cut edge and in the clear center.
    const t = Math.min(1, Math.max(0, depth / band));
    // Quarter-ellipse bevel: light turns most at the outside shoulder and
    // straightens toward the face. Taper the very lip for antialiasing.
    const normal = 1 - t;
    const bend = depth > 0 && depth < band ? (profileName === 'lens'
      ? Math.min(1,depth/1.2) * Math.sin(Math.asin(normal) - Math.asin(normal/1.48)) / .69
      : Math.sin(Math.PI * t) ** 2) : 0;
    const i = (y * mapWidth + x) * 4;
    pixels.data[i] = Math.round(127.5 - nx * bend * 105);
    pixels.data[i + 1] = Math.round(127.5 - ny * bend * 105);
    pixels.data[i + 2] = 128; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const id = `${prefix}${filterSerial++}`;
  const filter = element('filter', {id, x:0, y:0, width, height, filterUnits:'userSpaceOnUse', 'color-interpolation-filters':'sRGB'});
  filter.append(element('feImage', {href:canvas.toDataURL(), x:0, y:0, width, height, preserveAspectRatio:'none', result:'rim'}));
  filter.append(element('feDisplacementMap', {in:'SourceGraphic', in2:'rim', scale:strength, xChannelSelector:'R', yChannelSelector:'G'}));
  defs.append(filter);
  const entry = {key, id, filter, references:0};
  cache.set(key, entry);
  return entry;
}

function refreshSurface(surface) {
  const state = states.get(surface);
  if (destroyed || !state) return;
  // Moving overlapping displacement filters are costly on Android GPUs. Touch
  // cards keep the same transparent tint, specular rim and CSS optical fallback
  // throughout the gesture, so their material never switches at press/release.
  const touchCard = coarsePointer.matches && surface.hasAttribute('data-lg-moving');
  const cssOnly = ['css','opaque'].includes(surface.dataset.lgQuality);
  if (!surface.isConnected || !state.nearViewport || !nativeRefraction || touchCard || cssOnly || reduceTransparency.matches || forcedColors.matches) {
    clearOptics(state);
    return;
  }
  const width = Math.round(surface.clientWidth), height = Math.round(surface.clientHeight);
  if (!width || !height) { clearOptics(state); return; }
  const radius = Math.min(parseFloat(getComputedStyle(surface).borderRadius) || 0, width / 2, height / 2);
  const entry = filterFor(width, height, radius, profileFor(surface));
  if (!entry) { clearOptics(state); return; }
  if (state.filterKey !== entry.key) {
    entry.references++;
    releaseFilter(state);
    state.filterKey = entry.key;
  }
  state.optics.style.setProperty('--glass-filter', `url("#${entry.id}")`);
  state.optics.dataset.optics = 'refractive';
}

function flushSurfaces() {
  if (destroyed) return;
  updateFrame = 0;
  const started = performance.now();
  for (const surface of pending) {
    pending.delete(surface);
    refreshSurface(surface);
    // Spread the first appearance of several large panels over frames.
    if (performance.now() - started > 8) break;
  }
  if (pending.size) updateFrame = requestAnimationFrame(flushSurfaces);
}

function queueSurface(surface) {
  if (destroyed) return;
  pending.add(surface);
  if (!updateFrame) updateFrame = requestAnimationFrame(flushSurfaces);
}

const proximity = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
  for (const {target, isIntersecting} of entries) {
    states.get(target).nearViewport = isIntersecting;
    queueSurface(target);
  }
}, {rootMargin:'360px'}) : null;

for (const surface of surfaces) {
  const host = materialHost(surface);
  for (const className of ['lg-optics', 'lg-rim']) {
    if (directChild(host, className)) continue;
    const layer = document.createElement('span'); layer.className = className;
    layer.setAttribute('aria-hidden', 'true'); host.prepend(layer); ownedLayers.push(layer);
  }
  states.set(surface, {optics:directChild(host, 'lg-optics'), filterKey:null, nearViewport:!proximity});
  if (proximity) proximity.observe(surface);
  else queueSurface(surface);
  let lightFrame = 0;
  if (surface.dataset.lg === 'lens') {
    listen(surface, 'pointerdown', event => {
      if (reduceMotion.matches) return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty('--light-x', (event.clientX - rect.left) / rect.width * 100 + '%');
      surface.style.setProperty('--light-y', (event.clientY - rect.top) / rect.height * 100 + '%');
    }, {passive:true});
  }
  listen(surface, 'pointermove', event => {
    if (!finePointer.matches || reduceMotion.matches || event.pointerType === 'touch' || event.buttons) return;
    if (event.target.closest(surfaceSelector) !== surface) return;
    cancelAnimationFrame(lightFrame); lightFrames.delete(lightFrame);
    lightFrame = requestAnimationFrame(() => {
      lightFrames.delete(lightFrame);
      if (reduceMotion.matches || !finePointer.matches) return;
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      surface.style.setProperty('--light-x', `${Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100))}%`);
      surface.style.setProperty('--light-y', `${Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))}%`);
      const across = (event.clientX - rect.left) / rect.width - .5;
      const down = (event.clientY - rect.top) / rect.height - .5;
      surface.style.setProperty('--reflection-turn', (35 + across * 68 + down * 24) + 'deg');
    });
    lightFrames.add(lightFrame);
  }, {passive:true});
  listen(surface, 'pointerleave', () => {
    cancelAnimationFrame(lightFrame); lightFrames.delete(lightFrame);
    surface.style.removeProperty('--light-x');
    surface.style.removeProperty('--light-y');
    surface.style.removeProperty('--reflection-turn');
  }, {passive:true});
}
const resize = new ResizeObserver(entries => entries.forEach(({target}) => queueSurface(target)));
surfaces.forEach(surface => resize.observe(surface));
for (const preference of [reduceTransparency, forcedColors, coarsePointer]) listen(preference, 'change', () => surfaces.forEach(queueSurface));
listen(reduceMotion, 'change', () => {
  if (!reduceMotion.matches) return;
  for (const surface of surfaces) {
    surface.style.removeProperty('--light-x');
    surface.style.removeProperty('--light-y');
  }
});


const qualities = new MutationObserver(entries => entries.forEach(({target}) => queueSurface(target)));
surfaces.forEach(surface => qualities.observe(surface,{attributes:true,attributeFilter:['data-lg-quality']}));
return {
  refresh() {surfaces.forEach(queueSurface);},
  destroy() {
    if (destroyed) return;
    destroyed = true;
    abort.abort(); resize.disconnect(); proximity?.disconnect(); qualities.disconnect();
    cancelAnimationFrame(updateFrame); lightFrames.forEach(cancelAnimationFrame); pending.clear();
    states.forEach(clearOptics); states.clear(); cache.clear(); svg.remove();
    ownedLayers.forEach(layer=>layer.remove());
    surfaces.forEach(surface=>{surface.style.removeProperty('--light-x');surface.style.removeProperty('--light-y');surface.style.removeProperty('--reflection-turn');});
  }
};

}
