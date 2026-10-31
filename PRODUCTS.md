# South Side DTF — two products in one repo

These are **separate products** that share print/packing libraries. Do not mix their UX.

## Customer builder (`/`)

- Public gang sheet builder for customers
- Upload, size charts, pricing estimate, preview, and Add to Cart (no customer file download)
- **Never** links to shop tools, cutter tests, or PLT downloads
- When **Pre-cut DTFs** is on and they add to cart: creates a customer folder in Google Drive and uploads the print PNG + cutter PLT
  - PLT is uploaded by the server (not a customer browser download)
  - PNG is proxied through our API when small enough; larger PNGs use a Drive session started with the page Origin (required for browser CORS)
- Every job (pre-cut or not) also gets an **Image list PDF** in the Drive folder: one row per design with its number, picture, print size (W × H in), quantity, sheet, preset, DPI and art file name — the reprint reference. Sample: [`docs/samples/image-list-sample.pdf`](docs/samples/image-list-sample.pdf)
- Drive uses shop Gmail OAuth (personal Gmail has no Shared drives). Staff connect once at `/shop/connect-drive`
- WordPress: install `wordpress/southside-gangsheet-1.29.zip`, shortcode `[southside_gangsheet]` — embeds `/embed` and supports **Add to Cart** via postMessage
  - `[southside_gangsheet mode="upload"]` → `/embed/upload`; `[southside_gangsheet mode="uv-dtf"]` → `/embed/uv-dtf` (UV DTF gang sheet builder; old `mode="stickers"` loads it too)
  - UV DTF lines go to the **UV DTF product** (Settings → Gang Sheet Builder, or auto-detected via `pa_print_type = uv-dtf`) and carry `Print type` + `Cut: Square Cut 2.5 mm / No` meta. Pre-cut adds the same per-transfer companion line as DTF
- **Print & Press** add-on (customer supplies garments, we press): garment lines (Front / Left chest logo / Back / Front + Back / Left chest logo + Back) set the design quantities, every transfer is pre-cut (fee waived), a press sheet PDF goes to Drive with the PNGs/PLTs, and the plugin adds one **Print & Press labor** cart fee recomputed server-side (ladder $10 / $5 / $3 / $2 / $1.50 per garment for 1–10 / 11–20 / 21–50 / 51–99 / 100+, second side +$2 / +$1.50 / +$1.25 / +$1 / +$0.75, +$0.50 per personalized garment)

## Customer UV DTF builder (`/uv-dtf`)

- Same builder as `/` (`components/gang-sheet-builder.tsx`, product `UV_DTF_PRODUCT` in `lib/gang-sheet-product.ts`): 22 in media, title "Build My UV DTF Gangsheet"
- Own size chart (`UV_DTF_SIZE_CHART` in `lib/size-charts.ts`): step 3 categories Drinkware · Tech + Accessories · Signs + Auto · Storage + Packaging · Custom, each listing its numbered items (1–30, as on the UV DTF Size Guide picture) with decal sizes. Size menus add the 9 standard decal sizes (1.5 × 1.5 to 8 × 5 in)
- Ladder (`uvDtfSheetOptions` in `lib/sheet-pricing.ts`): 12 in $15 · 24 $26 · 36 $37 · 48 $49 · 60 $60 · 72 $72 · 120 $140 · 240 $260; longer jobs split at 240 in. The WooCommerce UV DTF product needs a variation for every one of these lengths
- **Pre-cut UV DTFs**: same per-transfer rates as DTF; prints at 21.75 in so the registration marks stay on the 22 in paper
- No Print & Press
- `/embed/uv-dtf` → `/uv-dtf?embed=1`; `/stickers` and `/embed/stickers` redirect here

## Shop tools (`/shop`)

- Internal production app for staff
- Full builder plus PLT cut files, registration-mark guidance, and cutter tests
- Pre-cut builds also save PNG + PLT to Google Drive (and still download both locally for the cutter PC)
- Confirm & Build also downloads and uploads the **Image list PDF** (design number, picture, print size, quantity per design)
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
- **Top menu** — Shop Builder · DTF Stickers · Vinyl Stickers · Halftone Generator on every page
  (Vinyl shows Coming soon until its app URL is set).
- **Reopen Project (Shop Builder)** — staff search and open any project: shop, customer site, or
  DTF Stickers.
- **A JSON for every project** — including customer-site projects, written to Google Drive
  automatically as soon as the customer's files are created. File is named after the project
  (`Customer Name.ssp.json`) and embeds design art so Reopen shows the images.
- **Automatic project JSON** — Drive uploads create/update the project `.ssp.json` in the job folder.
- **Add to Cart progress card** — blocking status card with steps, elapsed time and Drive upload % from the click until the store cart opens.
- **Version footer** — current version (v2.12.0) shown at the bottom of every builder page.
- Spec: [`docs/GANGSHEET_ADDON_SPEC.md`](docs/GANGSHEET_ADDON_SPEC.md)

### Shop sticker routes (staff)

- `/shop/sticker-maker` — staff UV DTF sticker builder (22 × 12 in min; 21.75 in wide with Cut on); vinyl is not in this app. Customers use `/uv-dtf`
