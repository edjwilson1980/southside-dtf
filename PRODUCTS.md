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

- **UV DTF / Sticker cut lines** — an "Add Contour Cut" checkbox above the image list turns
  cut lines on for every image (off = no cuts). Per image, customers choose Circle, Box, or
  Contour with a +/− border control (2 mm default, 0.5 mm steps). No style selected = Box at
  2 mm that hugs the image. Cut paths export as a `CutContour` spot-color layer and drive
  gang-sheet nesting and pricing.
- **Save & reopen projects** — the full project saves as a JSON file to Google Drive and can be
  reopened later to edit or fix.
- **Staff tools** — Fix mode, load a project JSON exactly as it was ordered, export layered
  Photoshop files (art only) with all original uploads, and re-import Photoshop edits.
- Spec: [`docs/GANGSHEET_ADDON_SPEC.md`](docs/GANGSHEET_ADDON_SPEC.md)

### Shop sticker routes (staff)

- `/shop/sticker-maker` — UV DTF (22 × 12 in min) and vinyl (8 × 11 in min) sticker builder
