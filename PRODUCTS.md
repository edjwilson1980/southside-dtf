# South Side DTF — two products in one repo

These are **separate products** that share print/packing libraries. Do not mix their UX.

## Customer builder (`/`)

- Public gang sheet builder for customers
- Upload, size charts, pricing estimate, preview, and Add to Cart (no customer file download)
- **Never** links to shop tools, cutter tests, or PLT downloads
- When **Pre-cut DTFs** is on and they add to cart: creates a customer folder in Google Drive and uploads the print PNG + cutter PLT
  - PLT is uploaded by the server (not a customer browser download)
  - PNG is proxied through our API when small enough; larger PNGs use a Drive session started with the page Origin (required for browser CORS)
- Drive uses shop Gmail OAuth (personal Gmail has no Shared drives). Staff connect once at `/shop/connect-drive`
- WordPress: install `wordpress/southside-gangsheet-1.03.zip`, shortcode `[southside_gangsheet]` — embeds `/embed` and supports **Add to Cart** via postMessage

## Shop tools (`/shop`)

- Internal production app for staff
- Full builder plus PLT cut files, registration-mark guidance, and cutter tests
- Pre-cut builds also save PNG + PLT to Google Drive (and still download both locally for the cutter PC)
- May link to the customer builder
- Advanced features belong here, not on `/`

### Shop routes

- `/shop` — production gang sheet builder
- `/shop/cutter-test` — cutter advance / registration tests
- `/cutter-test` — redirects to `/shop/cutter-test`
- `/shop/connect-drive` — connect shop Gmail for Drive uploads

Shared code lives under `lib/` (compose, cut layout, sheet size, image tools).

## Features

- **DTF Sticker Maker (UV DTF only)** — Box 2 "Cut / No Cut" under Customer Name. Cut = fixed
  2.5 mm Square Cut on every image. The preview draws a solid red `#E10600` cut trace, plus
  registration marks and a Start Cut box. Cut paths export as a `CutContour` spot-color layer.
  Vinyl stickers are a separate project — see [`docs/VINYL_STICKER_MAKER_SPEC.md`](docs/VINYL_STICKER_MAKER_SPEC.md).
- **Save Job / Reopen Job** (sticker maker only) — Reopen Job, Save to Photoshop, and Connect to
  Google Drive sit in the upper-right bar above the page. Save Job sits below Box 2. Jobs save as
  JSON to Google Drive. Vinyl job files are rejected with a Vinyl Sticker Maker message.
- **Staff tools** — Fix mode, load a project JSON exactly as it was ordered, export layered
  Photoshop files (art only) with all original uploads, and re-import Photoshop edits.
- **Version footer** — current version (v2.1.0) shown at the bottom of every builder page.
- Spec: [`docs/GANGSHEET_ADDON_SPEC.md`](docs/GANGSHEET_ADDON_SPEC.md)

### Shop sticker routes (staff)

- `/shop/sticker-maker` — UV DTF sticker builder (22 × 12 in min); vinyl is not in this app
