# Photography edition — 2026-11-16

Approved after local desktop and mobile review. Source is app/folio/; tools/page.html and app/editorial.js generate the same presentation for runtime and cloud publication. Do not edit generated HTML alone.

White paper, original uncropped photographs, approved Photography SVG, clear central transmission and narrow sampled edge refraction. No extra headlines or bold display type. Header has its own initial space. Hero and grid share edges. Desktop arrows appear at photo edges on hover/focus; touch uses swipes. Mobile menu opens collections immediately. About integrates contact with action labels instead of a visible address. The copyright line links to mingyao.li; the document scrolls with no scrollbar gutter. Footer pink gradient ends at alpha zero.

Controls sample actual same-origin photos. Underlying editorial text behind an open sheet is selectively softened to keep menu labels readable. Reduced motion, reduced transparency and forced colours retain alternatives.

Browser touch simulation at 320, 390 and 430 CSS pixels verified forward/reverse in panorama, single and full-screen modes, taps, vertical scroll and cancellation. These checks do not establish physical iOS/Android performance or Safari optical equivalence.

Release: run npm test, npm run build, npm run prepare:d1 and the Worker dry run; inspect generated pages and exact GitHub Pages deployment. Update the shared Worker assets too so later cloud content publication uses this template. Never seed or replace the existing D1 database during a visual release.

Upload verification on 2026-11-16: an owner-authenticated browser imported a temporary 640×426 JPEG, uploaded its lossless WebP rendition through the normal save action, and verified the GitHub-hosted image decoded at 640×426. The hidden test library record was then removed and saved; the library returned to 63 records. Historical media remains available for existing history/backup references. The upload token is repository-scoped Contents read/write, expires 2027-02-14, and is stored only as a Worker secret. A cloud-save consistency issue was corrected by normalizing CRLF templates before page generation; local and cloud output must match.
