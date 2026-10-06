# Legacy views

Only the current homepage footer links to the design retrospective. Collection pages, About, Contact and the private preview omit this entry. Two browsing pages reproduce the historical homepage structures using current public photographs.

The November 2022 reference is commit `ae40292`: navy `#100b3a`, the full original signature canvas at 30% header width, the 1%/4% translucent header margins, serif Home/Gallery navigation, 2:1 opening slideshow and horizontal two-row album. Album slots retain the historical image dimensions and variable column widths. A restrained refinement removes placeholder captions, adds 12px between album columns and 6px between paired frames, softens the header border and limits arrow hit areas to 52 by 64px. The August 2023 reference is commit `50a4a32`: twin 200px color/monochrome marks, Lucida navigation, the original language badge, 80px desktop page padding, 4px tile padding and the original six-column tile sequence. Logo, language and arrow artwork is preserved byte-for-byte. Social icons come from the historical footer; their links follow current configuration.

These pages reinterpret historical designs using current photographs. They are not frozen records of the photographs shown in those years. The page labels make that distinction explicit. Historical screenshots remain a separate archive.

## Illustrated history

The Legacy landing page and both historical views link to `history.html`, an English reading page adapted from the 26-page design-history booklet. Native HTML text, year navigation, an identity atlas and a continuity comparison replace the print layout. The archive is reviewed through 2 October 2026; later portfolio edits do not rewrite historical claims or screenshots. Captions distinguish preserved images from historical pages reconstructed in a modern browser.

`content/history.json` stores the article text and illustration metadata. `tools/build-history.mjs` builds the page. Historical repository references are kept outside the published reading page; it contains no repository or commit links. The original logo files are preserved in `assets/history`; their transparent canvas margins are framed with CSS. Browser screenshots use WebP previews with direct inspection links. Only this reading page loads these illustrations, and images below the cover are lazy-loaded. The main photo library and cloud publishing data are unaffected. Native chapter anchors and the complete article work without JavaScript; the small script marks the active chapter while reading.

## Content and navigation

All views read the same public content endpoint as the current website. Their default retrospective includes all published photographs in visible categories, reflecting the historical unfiltered homepages. The footer also permits choosing a current curated collection, whose selection and ordering remain shared with the current portfolio. Panoramas appear only in the opening area. Photographs fill the historical frames with object-cover; the full photograph remains available in the viewer. Switching years preserves the collection. About and Contact link to current pages. The second 2023 mark provides a monochrome preview of the same current photographs; the original language badge changes the legacy navigation labels, without introducing separate historical editorial pages.

A fresh navigation reads current content. An open tab checks for changes on focus or visibility after at least 30 seconds and offers a refresh, matching the current portfolio's behavior. Failed reads display a retry action; they never substitute an old public snapshot that could reveal a hidden photograph. Local previews intentionally use the local public document, following the development server's existing behavior.

There is no separate database, admin editor or photo upload workflow for these views. Historical branding stays fixed while current copyright information, public collection settings and photographs follow the shared source.

## Build and interaction

`npm run build` generates `legacy.html`, `legacy-2022.html` and `legacy-2023.html` from the shared legacy page template. Their styles and script are separate from the modern portfolio. Historical reproductions start immediately with their original header and photographs; the added archive controls live beneath the historical footer. Legacy pages are excluded from search indexing.

Opening slides use the original five-second cadence. The 2022 horizontal album advances every three seconds and changes to one row below 1024px. Playback pauses for hidden tabs, an open viewer and reduced-motion preferences, and a footer control permits manual pausing. The 2023 page retains the historical mobile menu and single-column wall below 768px. Clicking a photograph uses the existing viewer and restores the reading position when closed.

The old jQuery/Slick, scroll locking, broken external links and duplicate styles are not restored. Current photographs have different ratios, counts and crops from the historical collection, so their exact image compositions and resulting page heights differ. This reproduction preserves the historical layout rules rather than claiming a pixel-identical archive screenshot.
