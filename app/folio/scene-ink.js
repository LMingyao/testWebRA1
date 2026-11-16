// Read actual, same-origin image pixels to keep labels readable on clear glass.
// The photographs are never copied into the material or changed.
export function createSceneInk() {
  const cache = new WeakMap();
  let frame = 0, timer = 0, last = 0, paused = false;
  const linear = value => {const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
  function pixels(image) {
    const key=image.currentSrc || image.src;
    let entry=cache.get(image);
    if(entry?.key===key) return entry.data;
    try {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.drawImage(image,0,0,64,64);
      const data=context.getImageData(0,0,64,64).data;
      cache.set(image,{key,data});return data;
    } catch {cache.set(image,{key,data:null});return null;}
  }
  function update() {
    frame=0;last=performance.now();
    if(paused || document.visibilityState!=='visible' || document.documentElement.dataset.material!=='glass') return;
    const viewer=document.querySelector('.lightbox[open]');
    const images=[...(viewer || document.querySelector('main') || document).querySelectorAll('img')]
      .filter(image=>image.complete && image.naturalWidth)
      .map(image=>({image,rect:image.getBoundingClientRect()}))
      .filter(({rect})=>rect.bottom>0 && rect.top<innerHeight && rect.width && rect.height);
    function sample(x,y,alpha) {
      let rgb=[255,255,255];
      for(const {image,rect} of images) {
        const scale=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
        const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
        const left=rect.left+(rect.width-width)/2,top=rect.top+(rect.height-height)/2;
        if(x<left || x>=left+width || y<top || y>=top+height) continue;
        const data=pixels(image);
        if(data) {const at=(Math.min(63,Math.floor((y-top)/height*64))*64+Math.min(63,Math.floor((x-left)/width*64)))*4;rgb=[data[at],data[at+1],data[at+2]];}
        break;
      }
      const [r,g,b]=rgb.map(c=>linear(c*(1-alpha)+255*alpha));
      return .2126*r+.7152*g+.0722*b;
    }
    const selector='.site-header .brand,.site-header .menu-toggle,.site-header .work-toggle,.site-header nav>a,#work-menu>a,.collection-label,.view-controls button,.glass-dock-arrows button,.opening-controls button,.single-controls button,.lightbox-close,.viewer-navigation button';
    for(const element of document.querySelectorAll(selector)) {
      const rect=element.getBoundingClientRect();
      if(!rect.width || !rect.height || rect.bottom<0 || rect.top>innerHeight) continue;
      const surface=element.closest('.lg-surface');
      const optics=surface?.querySelector(':scope>.lg-optics');
      const fill=optics?getComputedStyle(optics).backgroundColor:'';
      const alpha=surface?.dataset.lgQuality==='opaque' || matchMedia('(prefers-reduced-transparency:reduce)').matches ? 1 : Number(fill.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1] ?? .08);
      let inkBounds=rect;
      if (element.matches('.work-toggle,#navigation>a,#work-menu>a')) {
        const text=[...element.childNodes].find(n=>n.nodeType===Node.TEXT_NODE && n.textContent.trim());
        if (text) {
          const range=document.createRange();range.selectNodeContents(text);
          const label=range.getBoundingClientRect();
          if (label.width && label.height) inkBounds=label;
        }
      }
      const values=[];
      for(const x of [.18,.5,.82]) for(const y of [.3,.5,.7]) values.push(sample(inkBounds.left+inkBounds.width*x,inkBounds.top+inkBounds.height*y,alpha));
      values.sort((a,b)=>a-b);
      if (inkBounds!==rect) element.toggleAttribute('data-mixed-ink',values[7]-values[1]>.28);
      const luma=values[4];
      // Choose between the approved dark ink and a white label by contrast.
      const whiteContrast = 1.05 / (luma + .05);
      const darkContrast = (luma + .05) / .057;
      // When both inks read similarly, keep the last one to prevent chatter
      // as a fine texture passes under a stationary control.
      const similar = Math.abs(whiteContrast - darkContrast) < .35;
      const light = similar && element.dataset.sceneInk
        ? element.dataset.sceneInk === 'light'
        : whiteContrast > darkContrast;
      element.dataset.sceneInk=light?'light':'dark';
    }
  }
  function refresh() {
    if(paused || frame || timer) return;
    const delay=Math.max(0,100-(performance.now()-last));
    if(delay) timer=setTimeout(()=>{timer=0;frame=requestAnimationFrame(update);},delay);
    else frame=requestAnimationFrame(update);
  }
  window.addEventListener('scroll',refresh,{passive:true});
  window.addEventListener('resize',refresh,{passive:true});
  document.addEventListener('load',refresh,true);
  document.addEventListener('visibilitychange',refresh);
  return {
    refresh,
    pause(){paused=true;cancelAnimationFrame(frame);clearTimeout(timer);frame=timer=0;},
    resume(){paused=false;refresh();},
  };
}
