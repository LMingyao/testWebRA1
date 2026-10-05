const paths = {
  photos: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 15 5-5 6 6 3-3 4 4"/><circle cx="16" cy="8" r="1.5"/>',
  collections: '<rect x="3" y="4" width="7" height="16" rx="2"/><rect x="14" y="4" width="7" height="10" rx="2"/><path d="M14 18h7"/>',
  settings: '<path d="M12 3v18M3 8h18M3 16h18"/><circle cx="8" cy="8" r="2"/><circle cx="16" cy="16" r="2"/>',
  history: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v5l3 2"/>',
  maintenance: '<path d="m14 6 4 4M3 21l8-8M15 3a6 6 0 0 0-7 8l-5 5a3 3 0 0 0 5 5l5-5a6 6 0 0 0 8-7l-4 4-4-4 4-4Z"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hidden: '<path d="m3 3 18 18M9 5a12 12 0 0 1 3 0c7 0 10 7 10 7a20 20 0 0 1-3 4M6 6a20 20 0 0 0-4 6s3 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/>',
  drag: '<circle cx="9" cy="5" r=".8"/><circle cx="15" cy="5" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="19" r=".8"/><circle cx="15" cy="19" r=".8"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
export function studioIcon(name) {
  return `<svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.photos}</svg>`;
}
