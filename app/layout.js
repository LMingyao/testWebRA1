// Find row breaks that keep photographs near a comfortable viewing size.
// Source order and original proportions are preserved, including the last row.
export function photoRows(photos, { width = 1320, gap = 18, targetHeight = 280 } = {}) {
  if (!photos.length) return [];
  const ratios = photos.map(photo => photo.width / photo.height);
  if (width <= 660)
    return photos.map((photo, i) => ({ photos: [photo], width, height: width / ratios[i] }));
  const scores = Array(photos.length + 1).fill(Infinity), choices = [];
  scores[photos.length] = 0;
  for (let start = photos.length - 1; start >= 0; start--) {
    let ratio = 0;
    for (let end = start; end < Math.min(photos.length, start + 6); end++) {
      ratio += ratios[end];
      const members = ratios.slice(start, end + 1), count = members.length;
      const isolated = members.some(value => value >= 2.8 || value <= 0.3);
      if (isolated && count > 1) break;
      const available = width - gap * (count - 1);
      if (available <= 0) break;
      const naturalHeight = available / ratio;
      const last = end === photos.length - 1;
      const height = ratios[start] <= 0.3
        ? Math.min(naturalHeight, targetHeight * 1.7)
        : last && naturalHeight > targetHeight * 1.2
          ? targetHeight : naturalHeight;
      const rowWidth = height * ratio + gap * (count - 1);
      const smallest = height * Math.min(...members), minimum = width < 1020 ? 96 : 128;
      const sizeCost = isolated ? 0 : Math.log(height / targetHeight) ** 2;
      const narrowCost = count > 1 && smallest < minimum ? ((minimum - smallest) / minimum) ** 2 * 5 : 0;
      const unusedCost = ((width - rowWidth) / width) ** 2 * 0.7;
      const cost = sizeCost + narrowCost + unusedCost + 0.04 + scores[end + 1];
      if (cost < scores[start]) {
        scores[start] = cost;
        choices[start] = { end, width: rowWidth, height };
      }
    }
  }
  const rows = [];
  for (let start = 0; start < photos.length;) {
    const choice = choices[start];
    rows.push({ photos: photos.slice(start, choice.end + 1), width: choice.width, height: choice.height });
    start = choice.end + 1;
  }
  return rows;
}
