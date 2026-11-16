// Render only the curved shoulder. The flat face is the actual page seen
// through the control, so it keeps the photograph's original detail.
const reach = 52;
const reflectionScale = 6;
// Soften only the underlying *type* behind an open sheet. Blank paper and
// photographs keep their direct, clear transmission, even on a mixed spread.
function protectMenuLabels(host, bounds) {
  const masks = [];
  for (const node of document.querySelectorAll('.editorial-heading,.about-copy>.eyebrow,.about-copy .body-copy,.gear,.contact-page,.site-footer')) {
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const x = Math.max(0, r.left - bounds.left - 5), y = Math.max(0, r.top - bounds.top - 5);
    const w = Math.min(bounds.width, r.right - bounds.left + 5) - x;
    const h = Math.min(bounds.height, r.bottom - bounds.top + 5) - y;
    if (w > 0 && h > 0) masks.push(`linear-gradient(#000 0 0) ${Math.floor(x)}px ${Math.floor(y)}px / ${Math.ceil(w)}px ${Math.ceil(h)}px no-repeat`);
  }
  host.toggleAttribute('data-text-below', masks.length > 0);
  if (masks.length) host.style.setProperty('--type-mask', masks.join(','));
  else host.style.removeProperty('--type-mask');
}
// Blend reflected and transmitted light in linear RGB. Interpolating display
// values directly makes bright reflections on dark photographs look grey.
const linear = Float32Array.from({length:256}, (_, i) => {
  const s = i / 255;
  return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
});
const display = Uint8ClampedArray.from({length:4097}, (_, i) => {
  const l = i / 4096;
  return 255 * (l <= .0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - .055);
});

function buildShoulder(width, height, radius, density, headerLens) {
  const pixels = [];
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  // Keep the outer bevel narrow even on the large menu. The underlying page
  // remains visible through the painted shoulder, not just the flat face.
  const band = headerLens ? Math.min(8.5, halfHeight * .32) : Math.min(5.5, halfHeight * .19);
  const row = Math.round(width * density);
  const rows = Math.round(height * density);
  const sourceWidth = width + reach * 2, sourceHeight = height + reach * 2;
  const envWidth = Math.ceil(sourceWidth / reflectionScale), envHeight = Math.ceil(sourceHeight / reflectionScale);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < row; x++) {
      const px = (x + .5) / density - halfWidth;
      const py = (y + .5) / density - halfHeight;
      const qx = Math.abs(px) - halfWidth + radius;
      const qy = Math.abs(py) - halfHeight + radius;
      const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
      const corner = Math.hypot(ax, ay);
      const depth = radius - corner - Math.min(Math.max(qx, qy), 0);
      if (depth < 0 || depth >= band) continue;
      const nx = Math.sign(px) * (corner ? ax / corner : Number(qx > qy));
      const ny = Math.sign(py) * (corner ? ay / corner : Number(qx <= qy));
      const slope = headerLens ? Math.cos(.5 * Math.PI * depth / band) ** 1.4 : (1 - depth / band) ** .85;
      const theta = Math.asin(slope);
      const travel = (headerLens ? 39 : 32) * Math.tan(theta - Math.asin(slope / 1.48));
      const cx = px + halfWidth + reach, cy = py + halfHeight + reach;
      const stride = width + reach * 2;
      const sample = (distance) => 4 * (Math.round(cy + ny * distance) * stride + Math.round(cx + nx * distance));
      // The reflected scene is a broad footprint; the transmitted scene keeps
      // full detail. Interpolate the footprint so it travels smoothly on scroll.
      const distance = reach * .9 * slope;
      const u = (cx + nx * distance) * envWidth / sourceWidth - .5;
      const v = (cy + ny * distance) * envHeight / sourceHeight - .5;
      const ix = Math.floor(u), iy = Math.floor(v);
      const fx = u - ix, fy = v - iy;
      const grazing = 1 - Math.sqrt(1 - slope * slope);
      pixels.push({
        dest:4 * (y * row + x),
        x:cx-reach, y:cy-reach, flexX:-nx*travel*.58, flexY:-ny*travel*.58,
        red:sample(-travel * .96), green:sample(-travel), blue:sample(-travel * 1.04),
        reflection:4 * (iy * envWidth + ix),
        w00:(1-fx)*(1-fy), w10:fx*(1-fy), w01:(1-fx)*fy, w11:fx*fy,
        fresnel:.025 + .20 * slope ** 3 + .65 * grazing ** 5,
        shade:1 - .025 * slope ** 3 * Math.max(0,.4*nx + .8*ny),
        alpha:255 * Math.min(1, depth * density) * (headerLens ? .92 : .64) * slope ** .65
      });
    }
  }
  return pixels;
}

function createShoulder(width, height, radius, density, headerLens) {
  const canvas = document.createElement('canvas');
  canvas.className = 'photo-lens-edge';
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  const output = canvas.getContext('2d');
  const source = document.createElement('canvas');
  source.width = width + reach * 2;
  source.height = height + reach * 2;
  const scene = source.getContext('2d', {willReadFrequently:true});
  const environment = document.createElement('canvas');
  environment.width = Math.ceil(source.width / reflectionScale);
  environment.height = Math.ceil(source.height / reflectionScale);
  const ambient = environment.getContext('2d', {willReadFrequently:true});
  if (!scene || !ambient || !output) return null;
  ambient.imageSmoothingQuality = 'high';
  const frame = output.createImageData(canvas.width, canvas.height);
  const pixels = buildShoulder(width, height, radius, density, headerLens);
  let data, reflection;

  function paint(bounds, images, paper) {
    // Outside a photo, leave transmission to the live page (including its
    // text and footer rule). Paper only contributes to the reflected light.
    scene.clearRect(0, 0, source.width, source.height);
    const left = bounds.left - reach, top = bounds.top - reach;
    for (const {image, rect} of images) {
      if (rect.right < left || rect.bottom < top || rect.left > left + source.width || rect.top > top + source.height) continue;
      const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      scene.drawImage(image, rect.left - left + (rect.width - w)/2, rect.top - top + (rect.height - h)/2, w, h);
    }
    data = scene.getImageData(0, 0, source.width, source.height).data;
    ambient.fillStyle = paper;
    ambient.fillRect(0, 0, environment.width, environment.height);
    ambient.drawImage(source,0,0,environment.width,environment.height);
    reflection = ambient.getImageData(0,0,environment.width,environment.height).data;
  }

  function draw(light) {
    if (!data) return;
    const rowBytes = environment.width * 4;
    const out = frame.data;
    for (const point of pixels) {
      const {dest, fresnel} = point;
      let shift = 0;
      if (light?.power > .002) {
        // The shoulder deepens locally under the moving highlight. Only the
        // cached edge rays are resampled; the centre never enters the canvas.
        const dx = (point.x - light.x) / 66;
        const dy = (point.y - light.y) / 62;
        const w = Math.max(0, 1 - dx * dx - dy * dy);
        const bend = light.power * w * w * (3 - 2*w);
        shift = 4 * (Math.round(point.flexX*bend) + source.width * Math.round(point.flexY*bend));
      }
      const transmission = (1 - fresnel) * data[point.green + shift + 3] / 255;
      const coverage = transmission + fresnel;
      for (let channel = 0; channel < 3; channel++) {
        const i = point.reflection + channel;
        const reflected = point.w00 * linear[reflection[i]] + point.w10 * linear[reflection[i+4]]
          + point.w01 * linear[reflection[i+rowBytes]] + point.w11 * linear[reflection[i+rowBytes+4]];
        const transmitted = channel === 0 ? point.red : channel === 1 ? point.green : point.blue;
        const radiance = (linear[data[transmitted+shift+channel]] * transmission + reflected * fresnel) / coverage;
        out[dest+channel] = display[Math.round(4096 * Math.min(1,radiance * point.shade))];
      }
      out[dest+3] = point.alpha * coverage;
    }
    output.putImageData(frame, 0, 0);
  }
  return {canvas, paint, draw};
}

export function createPortfolioLenses() {
  const cache = new WeakMap();
  const block = matchMedia('(forced-colors: active), (prefers-reduced-transparency: reduce)');
  const follow = matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
  const nav = document.querySelector('#navigation');
  const light = {x:36,y:9,power:0};
  const target = {...light};
  let navRenderer, lightFrame = 0, lastLightTime = 0;
  function animateLight(time) {
    lightFrame = 0;
    const fraction = 1 - Math.exp(-Math.min(50,time-lastLightTime)/48);
    lastLightTime = time;
    let moving = false;
    for (const key of ['x','y','power']) {
      const delta = target[key] - light[key];
      if (Math.abs(delta) < (key === 'power' ? .006 : .25)) light[key] = target[key];
      else {light[key] += delta*fraction; moving = true;}
    }
    nav.style.setProperty('--nav-light-x', light.x+'px');
    nav.style.setProperty('--nav-light-y', light.y+'px');
    nav.style.setProperty('--nav-light-power', light.power);
    if (!block.matches && nav.dataset.lg === 'lens') navRenderer?.draw(light);
    if (moving) lightFrame = requestAnimationFrame(animateLight);
  }
  function track(event) {
    target.power = 0;
    if (follow.matches && !block.matches && nav.dataset.lg === 'lens' && event.type === 'pointermove' && event.pointerType !== 'touch' && !event.target.closest('#work-menu')) {
      const r = nav.getBoundingClientRect();
      target.x = event.clientX-r.left;
      target.y = event.clientY-r.top;
      target.power = 1;
    }
    if (!lightFrame) {lastLightTime = performance.now()-16; lightFrame = requestAnimationFrame(animateLight);}
  }
  nav?.addEventListener('pointermove',track,{passive:true});
  nav?.addEventListener('pointerleave',track,{passive:true});
  follow.addEventListener('change', () => {
    if (follow.matches || !nav) return;
    cancelAnimationFrame(lightFrame);
    lightFrame = 0;
    light.power = target.power = 0;
    nav.style.removeProperty('--nav-light-power');
    nav.style.removeProperty('--nav-light-x');
    nav.style.removeProperty('--nav-light-y');
    refresh();
  });
  let pending = 0;
  function render() {
    pending = 0;
    if (document.hidden || document.documentElement.dataset.material !== 'glass') return;
    if (block.matches) return;
    const viewer = document.querySelector('.lightbox[open]');
    const content = viewer || document.querySelector('main');
    if (!content) return;
    const images = [...content.querySelectorAll('img')].filter(image => image.complete && image.naturalWidth)
      .map(image => ({image, rect:image.getBoundingClientRect()}));
    const paper = getComputedStyle(viewer || document.body).backgroundColor;
    for (const host of (viewer || document).querySelectorAll('[data-lg="lens"],[data-lg="sheet"]')) {
      const stage = host.closest('.work-opening,.single-stage,.viewer-stage');
      if (stage && !stage.matches(':hover,:focus-within')) continue;
      const rim = host.querySelector(':scope > .lg-rim');
      if (!rim) continue;
      const bounds = host.getBoundingClientRect();
      if (!bounds.width || bounds.top >= innerHeight || bounds.bottom <= 0) continue;
      if (host.dataset.lg === 'sheet') protectMenuLabels(host, bounds);
      const width = Math.round(bounds.width), height = Math.round(bounds.height);
      const radius = Math.min(height / 2, width / 2, parseFloat(getComputedStyle(host).borderRadius));
      const density = Math.min(devicePixelRatio || 1, 2);
      const headerLens = host.dataset.lg === 'lens' &&
        (host === nav || host.matches('.collection-toolbar, .menu-toggle'));
      const key = [width,height,radius,density,headerLens].join('/');
      let entry = cache.get(rim);
      if (entry?.key !== key) {
        const shoulder = createShoulder(width,height,radius,density,headerLens);
        if (!shoulder) continue;
        entry?.canvas.remove();
        entry = {...shoulder, key};
        cache.set(rim, entry);
        rim.append(entry.canvas);
      }
      try {
        entry.paint(bounds, images, paper);
        if (host === nav) navRenderer = entry;
        entry.draw(host === nav && headerLens && follow.matches ? light : null);
        rim.dataset.painted = '';
      } catch {
        delete rim.dataset.painted;
      }
    }
  }
  function refresh() {
    if (!pending) pending = requestAnimationFrame(render);
  }
  window.addEventListener('scroll', refresh, {passive:true});
  window.addEventListener('resize', refresh);
  window.addEventListener('pageshow', refresh);
  // A lens can appear without a layout change when the pointer or keyboard
  // enters a photo. Render its rim once on entry, including in the dialog.
  for (const enter of ['pointerover','focusin']) {
    document.addEventListener(enter, event => {
      const stage = event.target.closest?.('.work-opening,.single-stage,.viewer-stage');
      if (stage && !stage.contains(event.relatedTarget)) refresh();
    });
  }
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('load', refresh, true);
  document.addEventListener('animationend', event => {
    if (event.target.id === 'work-menu') refresh();
  });
  block.addEventListener('change', refresh);
  return {refresh};
}
