# Gallery editing and recovery

The authenticated D1 content document is the source of truth. GitHub stores public display images and published page snapshots. Editing a draft does not update the public site.

## Compose a collection

In the photo library, select the curated collection or a subject filter before sorting. Each collection has its own sequence and composition overrides; arranging the curated collection does not rearrange a subject collection. Without a collection filter, ordering and composition change the library fallback. Search results move only within their visible display-area slots. Panorama photographs remain separate from the lower gallery.

Select up to three gallery photographs to group them, or choose an independent row. Grouping moves the selected photographs together in the current sequence. Desktop and mobile preview use the same layout engine as the visitor site. Uploads start hidden and outside the curated collection. Publication flags and category visibility remain independent.

## Drafts and history

The editor keeps an unsaved draft, pending uploads and unapplied photo-form edits in IndexedDB in the current browser profile. This is local recovery, not a cloud backup. Clearing browser storage removes it. Reopening the editor offers recovery; a changed cloud revision requires reviewing the differences before restoring a new draft. Successful saves remove the local recovery copy.

The modification-history page lists the most recent 20 previous saves. A historical restore or imported JSON backup becomes a draft. Review it in preview and use the normal save action to publish. It does not restore authentication settings. A referenced image must still exist; removal from the library does not delete the image file.

## Uploads

The upload action expands an inline drop area. Choose the target category and display area before adding files, then drag them from the file manager or use the file-selection button. Each batch accepts at most 20 files. JPG inputs may be up to 100 MiB each; existing PNG and WebP inputs retain their 25 MiB limit. Folders and unsupported formats are rejected before preparing a batch. Progress and prepared thumbnails appear in the panel. Images join the local draft hidden; the normal save action uploads them and saves the content. No automatic category inference is performed.

Preparation runs sequentially in a dedicated Web Worker per source, releasing its decoder and encoder memory after completion. JPG marker preflight checks dimensions and EXIF rotation before decoding. Supported JPGs use 8-bit RGB or grayscale; unsupported precision and CMYK are rejected instead of silently converted. Source images are limited to 100 million pixels and a 30,000-pixel long edge. Modern Chrome or Edge with OffscreenCanvas and WebAssembly support is required.

Gallery and About inputs produce display renditions with long edges up to 640, 1280, 2048 and 3072 pixels. Inputs assigned to the top panorama produce 640, 1280, 2048 and 4096 variants. Dimensions remain proportional, without cropping or upscaling; identical dimensions share one file. Explicit rendition dimensions let responsive images select suitable files on mobile, desktop and high-density screens. Existing 1920-pixel uploads remain compatible. Moving a previously uploaded gallery image into the panorama does not invent a 4096-pixel rendition: reimport its original with the panorama destination to generate one.

The browser converts decoded pixels to 8-bit sRGB and resizes them before lossless VP8L encoding. The resized RGBA pixels are preserved by the encoder; shrinking still removes spatial detail. This is not a guarantee of original wide-gamut ICC, JPEG metadata or 16-bit source preservation. Prefer sRGB JPG exports. Original EXIF orientation is applied, but original metadata is not copied to the display file. There is no automatic reduction in encoding quality to meet a byte target. A rendition over 8 MiB fails with a clear message rather than being silently degraded.

Server media requests accept the new sizes with at most four variants per batch and a 16 MiB JSON request cap. The adapter splits unusually large groups into additional bounded requests; ordinary four-variant groups use one Git commit. Interrupted media submissions can be retried without overwriting existing paths or creating duplicate successful uploads. The local and direct-Git adapters retain their 28 MiB combined pending-upload save limit; save smaller groups if needed.

The site stores display renditions, not the original JPEG or RAW. Keep photographic originals in the owner's existing archive. If a session expires or a save fails, retain the draft and reconnect; do not assume that an ambiguous network timeout means the cloud save failed. Recheck the cloud revision before retrying.

## Save and publish

1. Saving uploads pending media and atomically updates the D1 document with a revision check.
2. The publisher creates public HTML, sharing metadata, sitemap, a sanitized public document and a version marker on the configured Git branch.
3. GitHub Pages must deploy that commit before the static version is live. The maintenance page compares the live marker with the cloud revision; submission alone is not deployment success.

A static publishing failure does not undo a successful D1 save. Retry synchronization from the maintenance page. Publishing uses a lease and checks the current revision before advancing the branch without force. Git and D1 are separate systems; another save during synchronization can require another synchronization. The status exposes this instead of claiming atomic cross-system deployment.

New page loads revalidate public content. An existing visitor tab checks for changes when focused or shown again after at least 30 seconds and offers a refresh; browsing is not interrupted by an automatic reload. Sharing platforms can retain their own previews after deployment.

Verified public snapshots can pre-render photographs. The build requires a matching source digest before using repository content for photo pre-rendering; an old development document must not briefly expose cloud-hidden photographs. Deleted or hidden entry paths show an unavailable notice and are excluded from the sitemap. Hiding photographs does not make existing public Git files private.

## Maintenance

The maintenance page checks D1, repository credential readability, one public image and the deployed publication revision. Repository readability is not proof of write permission; an actual upload verifies writing. The image check is a sample, not an exhaustive file audit.

The unused-file report protects current content and retained history references. It includes registered files and managed uploaded paths discovered in Git. An incomplete repository scan is explicitly reported. It never deletes files automatically.

## Complete display-media backup

Download the full backup manifest from the maintenance page, then run these commands from the project directory:

```powershell
node tools/backup.mjs "gallery-backup-manifest.json" "backup-directory"
node tools/backup.mjs --verify "backup-directory"
```

The tool downloads every registered display-media file, records and verifies SHA-256 checksums, and exports the current document, retained history and an empty-database content restore script. It can resume an incomplete download when existing files match. A completed backup must use a new destination for the next run. Backup folders contain site data and should stay outside source control.

To recover into a replacement environment:

1. Create an empty D1 database and apply all schema migrations.
2. Restore the media files at the same logical paths in the configured image repository.
3. Import `restore-content.sql` only into the empty content database. It intentionally rejects an existing content singleton. The recovered current revision is recalculated from the document; history is restored separately.
4. Configure bindings and server secrets separately. Passwords, sessions, upload tokens, original RAW/JPEG files and unrelated repository files are outside this backup.
5. Verify the restored media checksums, sign in, preview collections and synchronize the public pages.

Keep a separate database export if an exact recovery of every operational table is required.

## Release checks

Run `npm test`, `npm run build` and `npm run prepare:d1`. Apply `0003_publication.sql` to the existing production database before deploying the new Worker. Do not import a development seed into a nonempty production database. Publish frontend modules and deploy protected admin assets from the same source version. Check the cloud save, public feed and deployed static marker after release. Local fixtures and mocked Git commits validate behavior but do not establish production deployment success.
