import { workPhotos } from './shared.js';
import { collections, resolveCollection } from './config.js';

export function legacyCollection(content, requested) {
  const category = requested === '*' ? '*' : resolveCollection(content, requested);
  const visible = new Set(content.categories.filter(item => item.visible !== false).map(item => item.id));
  const photos = category === '*'
    ? content.photos.filter(photo => photo.published && visible.has(photo.category))
    : workPhotos(content, category);
  return { category, collections: [{id:'*', label:'All photographs'}, ...collections(content)], photos,
    panoramas: photos.filter(photo => photo.placement === 'hero'),
    wall: photos.filter(photo => photo.placement !== 'hero') };
}

// The six column patterns follow the August 2023 color homepage.
const mosaicPatterns = [[2,2,1],[1,2,2,2,2],[1,2,2,2,2],[2,2,1],[2,2,1],[1,2,2,2,2]];
export function legacyMosaic(photos) {
  const columns = [];
  let offset = 0;
  while (offset < photos.length) {
    const pattern = mosaicPatterns[columns.length % mosaicPatterns.length];
    columns.push(pattern.slice(0, photos.length-offset).map(divisor => ({photo:photos[offset++],divisor})));
  }
  return columns;
}

// The 2022 album used image-sized slides rather than equal-width columns.
const albumFrames = [[400,434],[450,300],[450,300],[450,300],[1024,447],
  [1150,383],[600,450],[600,300],[450,450],[600,500],[572,564],
  [450,300],[600,300],[600,300],[450,600]];
export function legacyAlbum(photos) {
  const columns=[];
  for(let i=0;i<photos.length;i+=2) {
    const frames=photos.slice(i,i+2).map((photo,j)=>{
      const [width,height]=albumFrames[(i+j)%albumFrames.length];
      return {photo,width,height};
    });
    columns.push({width:Math.max(...frames.map(frame=>frame.width)),frames});
  }
  return columns;
}

export function legacyURL(year, category) {
  const file = ['2022', '2023'].includes(String(year)) ? `legacy-${year}.html` : 'legacy.html';
  return file + (category ? `?collection=${encodeURIComponent(category)}` : '');
}
