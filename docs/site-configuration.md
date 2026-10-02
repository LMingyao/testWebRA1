# Website configuration

The authenticated editor saves the content document to D1. Categories, collection navigation, identity, About content, contact details and equipment use this document at runtime. No database schema migration is required for these optional version-1 settings.

## Collections

- Subject category IDs remain stable when their display names change. Photographs keep their subject category.
- The `all` entry is the curated selection, populated by published photographs with `homeSelected: true`. It participates in naming, descriptions, ordering, visibility and default entry selection without duplicating photographs.
- `collections.order` controls the Work menu. New categories append to the order. Hidden categories remain editable in the editor.
- A hidden subject category removes its photographs from public collections and the public API. This does not change individual publication flags. Hiding the curated selection only hides that collection.
- Keep at least one collection visible. Hiding or deleting the configured default changes the default to the first visible collection. Empty visible collections display the existing empty state.
- `collections.default` controls the root homepage and logo link. Explicit category URLs retain their category. When the default is not `all`, the curated selection links to `index.html?category=all`.
- `collections.defaultView` chooses Multi or Single for a new browsing session. Visitors can still switch view.

Visibility is an editorial control, not file access protection: previously published files and direct image URLs may remain accessible.

## Site content

The site editor supports logo text, photographer name, location, email, biography, About heading and photograph, equipment title and items, navigation labels, About/Contact navigation visibility, contact copy, footer copyright copy, and ordered social links. The original typography, gradient and layout remain part of the design system.

The About photograph can be selected from the library or uploaded independently. Uploading a replacement does not create a gallery record. The editor uploads the referenced WebP before saving the document, retaining its existing revision checks. A chosen library image is public on About even if its gallery publication flag is disabled.

Equipment is stored as an array of individual strings and rendered one item per line. Existing string records remain readable; the editor separates their middle-dot, comma and spaced-slash entries. Saving site content writes the array. Removing every item hides the equipment section.

## Saving and freshness

Edits update the private draft preview. Use the main save button to publish. The public API returns uncached D1 content; visitors receive the saved navigation and content on the next page load or refresh. Existing visitor tabs do not automatically reload. Failed saves retain the draft, and stale revisions are rejected.

GitHub Pages serves static crawler metadata, sharing artwork, sitemap and fallback HTML from the last build. Browser metadata uses runtime content, but changing D1 content does not rebuild these static files. Domain, backend addresses, authentication credentials, image hosting, sharing artwork and the visual design system remain deployment/operator settings.

## Validation

Run `npm test`, `npm run build`, and `npm run prepare:d1`. Do not import the generated seed into an existing production database. Acceptance should include successive saves with different defaults, category visibility, equipment lists and contact details, plus reopening the visitor page and the editor. Use an isolated content copy for write tests.
