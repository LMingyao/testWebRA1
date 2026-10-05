// Compare complete row sequences, including changes in scale between rows.
// Source order and original proportions are preserved, including the last row.
export function photoRows(photos, { width = 1320, gap = 24, targetHeight = 350, maxHeight = Infinity } = {}) {
  if (!photos.length) return [];
  const ratios = photos.map(photo => photo.width / photo.height);
  if (width <= 660)
    return sectionRows(photos.map((photo, i) => {
      const naturalHeight = width / ratios[i];
      const height = photo.presentation === 'solo' ? Math.min(naturalHeight, maxHeight) : naturalHeight;
      return {photos:[photo], width:height * ratios[i], height};
    }));
  const options = Array.from({ length: photos.length }, () => []);
  for (let start = photos.length - 1; start >= 0; start--) {
    let ratio = 0;
    const group = photos[start].group?.trim() || "";
    for (let end = start; end < Math.min(photos.length, start + 3); end++) {
      const photo = photos[end], count = end - start + 1;
      if (count > 1 && (photos[start].presentation === "solo" || photo.presentation === "solo" ||
          (photo.group?.trim() || "") !== group)) break;
      ratio += ratios[end];
      const members = ratios.slice(start, end + 1);
      const isolated = members.some(value => value >= 2.8 || value <= 0.3);
      if (isolated && count > 1) break;
      const available = width - gap * (count - 1);
      if (available <= 0) break;
      const naturalHeight = available / ratio;
      const last = end === photos.length - 1;
      const desiredHeight = ratios[start] <= 0.3
        ? Math.min(naturalHeight, targetHeight * 1.7)
        : last && count === 1 && naturalHeight > targetHeight * 1.2
          ? targetHeight : Math.min(naturalHeight, targetHeight * 1.55);
      const height = Math.min(desiredHeight, maxHeight);
      const rowWidth = height * ratio + gap * (count - 1);
      const smallest = height * Math.min(...members), minimum = Math.min(300, width * 0.25);
      const sizeCost = isolated ? 0 : Math.log(height / targetHeight) ** 2;
      const narrowCost = count > 1 && smallest < minimum ? ((minimum - smallest) / minimum) ** 2 * 8 : 0;
      const unusedCost = ((width - rowWidth) / width) ** 2 * 0.7;
      const imbalance = Math.log(Math.max(...members) / Math.min(...members)) ** 2 * .55;
      const splitGroup = group && photos[end + 1]?.group?.trim() === group ? .65 : 0;
      const orphanCost = last && count === 1 && start > 0 && !isolated && !group &&
        photo.presentation !== "solo" && !photos[start - 1].group &&
        photos[start - 1].presentation !== "solo" ? 1.1 : 0;
      const ownCost = sizeCost + narrowCost + unusedCost + imbalance + splitGroup + orphanCost + .05;
      let cost = ownCost, next;
      if (!last) {
        cost = Infinity;
        for (const candidate of options[end + 1]) {
          const scaleChange = Math.log(candidate.height / height) ** 2 * (isolated || candidate.isolated ? .05 : .4);
          const total = ownCost + candidate.cost + scaleChange;
          if (total < cost) { cost = total; next = candidate; }
        }
      }
      options[start].push({ start, end, width: rowWidth, height, cost, next, isolated });
    }
  }
  const rows = [];
  let choice = options[0].reduce((best, row) => row.cost < best.cost ? row : best);
  while (choice) {
    rows.push({ photos: photos.slice(choice.start, choice.end + 1), width: choice.width, height: choice.height });
    choice = choice.next;
  }
  return sectionRows(rows);
}

function sectionRows(rows) {
  return rows.map((row,index) => {
    const previous = rows[index - 1]?.photos.at(-1), first = row.photos[0];
    const group = first.group?.trim() || '', previousGroup = previous?.group?.trim() || '';
    return {...row, sectionStart:Boolean(previous && ((group !== previousGroup && (group || previousGroup)) || first.presentation === 'solo' || previous.presentation === 'solo'))};
  });
}
