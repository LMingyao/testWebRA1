# Display-image encoder

The checked-in encoder and options come from `@jsquash/webp` 1.5.0, an Apache-2.0 browser/Web Worker package derived from Squoosh. The scalar encoder reports libwebp 1.1.0 and its libwebp component is BSD-licensed. See `LICENSE` and `LIBWEBP-COPYING` in this directory.

Only the scalar encoder is shipped. Image decoding uses the browser; originals are never sent to an external codec service. The worker explicitly enables lossless VP8L with `near_lossless: 100` and `exact: 1`. The `quality` setting controls lossless compression effort, not a lossy quality target.

After `npm ci`, run `node tools/vendor-webp.mjs` to reproduce the package files. Review and test codec upgrades before changing the pinned version. Run the image-processing tests to compare decoded output pixels with the source RGBA pixels.

Upstream: [jSquash](https://github.com/jamsinclair/jSquash), [libwebp](https://github.com/webmproject/libwebp).
