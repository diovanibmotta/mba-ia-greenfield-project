---
libs:
  "sharp":
    version: "0.35.5"
    context7_id: "n/a (Context7 unavailable; fetched from sharp.pixelplumbing.com)"
    fetched_at: "2026-10-13T14:15:39-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-04-gerenciamento.md: "2026-10-13T14:13:47-03:00"
---

# Library refs — phase-04-gerenciamento

### sharp

Source: https://sharp.pixelplumbing.com (install, constructor, resize, output pages). Version from `npm view sharp version` (0.35.5, Apache-2.0).

- **Requirements:** Node-API v9 runtime (Node.js >= 20.9.0). Prebuilt binaries come through npm optional dependencies — the package manager must install optional deps. Linux x64: glibc 2.28+ or musl 1.2.5+, CPU with SSE4.2. Confirm in the Node 25 container during implementation (`npm install sharp` + a resize smoke test).
- **Input:** `sharp(buffer)` accepts `Buffer`/`Uint8Array` with JPEG, PNG, WebP, AVIF, GIF, SVG or TIFF data. Constructor options: `failOn` (default `'warning'`; `'none' | 'truncated' | 'error'`), `limitInputPixels` (default 268402689; `false`/`0` removes it — keep the default to reject decompression bombs), `animated` (default `false`), `unlimited` (default `false`, keep it off).
- **Validate the format:** `await sharp(buffer).metadata()` returns `format`, `width`, `height` (Input metadata page, not fetched here — verify field names in the container); reject anything whose `format` is not `jpeg | png | webp` before writing to storage. It throws on non-image data.
- **Resize (TD-03):** only one `resize()` per pipeline.

```js
const { data, info } = await sharp(input)
  .resize(1280, 720, { fit: sharp.fit.inside, withoutEnlargement: true })
  .jpeg({ quality: 80, progressive: true })
  .toBuffer({ resolveWithObject: true });
// info.format === 'jpeg', info.width, info.height, info.size
```

  `fit: 'inside'` keeps the aspect ratio and bounds both dimensions; `withoutEnlargement: true` leaves smaller images as they are. Default `fit` is `cover` (crops) — do not rely on it.
- **Output:** `jpeg({ quality (1-100, default 80), progressive, mozjpeg, chromaSubsampling (default '4:2:0') })`. Metadata (EXIF) is stripped by default unless `keepMetadata()`/`withMetadata()` is called — keep the default so the stored thumbnail carries no EXIF.
- **toBuffer():** returns `Promise<Buffer>`; with `resolveWithObject: true` resolves `{ data, info }`.
