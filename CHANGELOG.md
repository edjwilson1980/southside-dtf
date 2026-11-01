# Changelog

## [2.14.1] — 2026-11-01

### Fixed
- Add to Cart on a store page with no cart relay now fails in about 4 s with a clear message,
  before any compose or Drive upload, instead of hanging 2 minutes and then saying "Timed out".
  This is what happened on southsidedtf.com/uv-dtf/: the iframe there is pasted HTML, not the
  `[southside_gangsheet mode="uv-dtf"]` shortcode, so the plugin never loads `embed.js`.
  `useStoreBridge().checkCartRelay()` pings the page with an add-to-cart that has no file link.
  Every `embed.js` version answers that at once, without calling the store. Used by the
  gang sheet builder and the sticker maker when embedded.
- **WordPress plugin 1.32** (`wordpress/southside-gangsheet-1.32.zip`): loads `embed.js` on pages that
  show the builder through a pasted iframe (Custom HTML block, widgets, Elementor HTML widget), not
  only through the shortcode. That page's Add to Cart now works. Same cart code as 1.31 otherwise.

### Changed
- UV DTF jobs lead with "UV" ("UV John Smith") on the film label, print/cut/image-list file
  names, Drive job folder, project name and cart line (`jobCustomerName`). The name box, the
  project's `customer.name` and DTF jobs are unchanged. A name that already starts with "UV"
  isn't doubled.
- After payment, `/api/drive/finalize` keeps UV DTF files starting with "UV" and the customer name.
  The order number goes after the name, so the file is "UV John Smith #1234 11-1 1500 (36).png"
  instead of "#1234__UV John Smith …" (`orderedFileName`). DTF files keep "#1234__" in front.

## [2.14.0] — 2026-11-01

### Added
- Manual builder: **free rotation**. The round handle turns the selected design to any angle
  (whole degrees, pulled to 0/90/180/270 within 4°, Shift for 15° steps) with a live angle readout.
  The size box has an **Angle (°)** field, and Rotate 90° / R add a quarter turn.
  `ManualPlacement.angle` replaces `rotated`. The print file draws the art at that angle
  (`SheetPiece.angleDeg`, `artWidthIn`, `artHeightIn`). Spacing checks, cut boxes and billing
  use the box the turned design takes up.
- Manual builder: **Duplicate** (Ctrl+D) adds one more copy of the selected design beside it, at the
  same size and angle (quantity + 1). **Delete** (Delete key) takes that copy off the order
  (quantity − 1; the last copy removes the design). The old Remove is now **Back to tray**.

## [2.13.0] — 2026-10-31

### Added
- **Manual DTF builder at `/manual`** ("Arrange My Own Gangsheet", store embed `/embed/manual`).
  Same name, upload and size steps as `/`. The customer then drags every transfer from a tray onto
  a to-scale 22.3 in sheet: ⅛ in snap, arrow-key nudge, Rotate 90°, Remove, Auto-arrange the rest
  (the packer, below what is placed), and Clear. Live checks flag overlaps, designs too close
  (cut lines touching with Pre-cut on, ⅛ in without), art in the label strip, cut-mark columns or
  past the working length, and designs too tall for one cutter pass. Add to Cart is blocked until
  every transfer is placed and nothing is flagged. Pre-cut works at the same rates. One sheet,
  billed like `/` by how far down the art reaches. No Print & Press in manual mode.
- `/` shows a **Switch to manual mode** link under the name field once a name is typed. The name
  carries over (`/manual?name=`). Manual mode links back.
- Manual sheet editor:
  - Light gray checkerboard film, showing only the printable stretch (label strips hidden).
  - A solid black edge that is a hard stop: drags, nudges, rotates and resizes are pulled back
    inside it, and it flashes red when hit. With Pre-cut on, the cut-mark columns are hatched
    outside the frame.
  - Length ruler down the left side (6 in or 12 in labels) and an "N in sheet" line at the working length.
- Manual resize and rotate: the selected design gets 8 handles (corners and sides, proportions
  locked, ⅛ in steps, ½ in minimum) with a live size and DPI badge, plus a drag-to-rotate handle
  that snaps upright or sideways. A size box takes an exact width or height. Resizing applies to
  that copy only (`ManualPlacement.scale`). The image list gets one row per printed size, and
  step 4 notes "Sizes vary on sheet".
- "Your uploads" list in manual mode: one row per design with thumbnail, size and "N of M left" /
  "All placed". The box is fixed height (300 px) and scrolls inside itself, with a "Scroll for more"
  hint.
- Gang sheet name: a manual-mode name bar (editable) with "Switch back to automatic mode". The name
  is shown over the sheet in both modes, and `/` now reads `?name=` so switching back keeps it.
- `lib/manual-layout.ts` (area, rules, auto-arrange, `manualSheetPage`) feeds the existing compose,
  PLT, Drive and cart code unchanged. Checks: `scripts/verify-manual-layout.mjs`.

## [2.12.0] — 2026-10-31

### Changed
- **UV DTF step 3 is now by item category:** Drinkware (POPULAR), Tech + Accessories, Signs + Auto,
  Storage + Packaging, and Custom. Picking a category lists its items, numbered 1–30 to match the
  UV DTF Size Guide (for example 1 · 20 oz Skinny Tumbler · 3 × 3 in). Tapping an item sets the size
  new uploads start at.
- UV DTF design rows: "What are you printing?" offers the categories. The size menu lists that
  category's items, then the 9 standard decal sizes. The DTF builder is unchanged.

## [2.11.0] — 2026-10-31

### Changed
- **UV DTF builder has its own size chart.** Step 3 offers **UV DTF Decal** and **Custom**
  instead of the garment cards. Decal sizes: Small 1.5 × 1.5 · Small+ 2 × 2 · **Medium 3 × 3**
  (the starting size, the most popular) · Medium Tall 3 × 4 · Large 4 × 4 · Large Wide 5 × 3 ·
  XL 6 × 4 · Window 5 × 5 · Door Sign 8 × 5 in. Custom still takes any width × height.
- The UV DTF builder shows the **UV DTF Size Guide** (`public/uv-dtf-size-guide.webp`) instead of
  the shirt chart.
- Size charts live in `lib/size-charts.ts`, one per product. The DTF garment chart moved there
  unchanged.

## [2.10.0] — 2026-10-31

### Added
- **UV DTF gang sheet builder at `/uv-dtf`** (store embed `/embed/uv-dtf`, WordPress
  `[southside_gangsheet mode="uv-dtf"]`). Same customer flow as the DTF builder at `/`, on 22 in
  media with the UV DTF ladder: 12 in $15 · 24 $26 · 36 $37 · 48 $49 · 60 $60 · 72 $72 ·
  120 $140 · 240 $260. Jobs longer than 240 in split into more sheets. Pre-cut uses the DTF
  per-transfer rates and prints at **21.75 in** so the cut marks stay on the paper. No Print & Press.
  Cart lines go to the UV DTF product with `printType: 'uv-dtf'`.
- The customer builder is now one component (`components/gang-sheet-builder.tsx`) driven by a
  product setting (`lib/gang-sheet-product.ts`). `/` is unchanged: DTF, 22.3 in, the same prices.
- WordPress plugin **1.29**: `mode="uv-dtf"` (and the old `stickers` / `uv` modes) embeds the UV
  DTF builder. UV DTF sheets get the pre-cut companion line. Cart rows read "Print type: UV DTF"
  and "Transfers". The fallback link no longer points at the staff sticker page.

### Changed
- `/stickers` and `/embed/stickers` redirect to the UV DTF builder. Staff keep `/shop/sticker-maker`,
  which prints at **21.75 in** with Cut on.
- `paginateGangSheet` takes a price ladder (its last tier is the longest sheet) and a label width.
  The image list PDF takes the media width. DTF defaults are unchanged.

### Fixed
- Registration marks follow the sheet width. On UV DTF they used the 22.3 in DTF spacing and
  printed out to ~22.29 in, past the 22 in paper. DTF gang sheets (22.3 in) are unchanged.

## [2.8.0] — 2026-10-21

### Added
- **Image list PDF in every export.** Every job now gets a third file next to the sheet PNGs
  and cut PLTs: `{Customer} {stamp}     Image list.pdf`. One row per design — its number (the
  same number printed on the gang sheet), a picture with the printed width and height called
  out, the **print size** in big type (for example `10.5 × 12 in`), the **quantity** of
  transfers, which sheet it is on (split counts for multi-sheet jobs), the garment/size preset
  the customer picked, the art's pixel size and DPI at that size, and the art file name in the
  Drive folder — plus a Reprint / qty / reason tick line for the crew. The sheet file box at
  the top names the PNG and PLT to reprint from. Customer builder: uploaded to the Drive job
  folder in the same batch as the sheets (before the cart redirect) and recorded as
  `product.imageList` in the project JSON. Shop builder: downloaded with the PNG/PLT and
  uploaded to Drive too. Samples: [`docs/samples/image-list-sample.pdf`](docs/samples/image-list-sample.pdf)
  (real builder output, 3 designs) and [`docs/samples/image-list-two-sheets.pdf`](docs/samples/image-list-two-sheets.pdf)
  (5 designs across 2 sheets, one with missing art).
- The Add to Cart progress card's paperwork step now reads "Writing the image list" (or
  "… image list + press sheet" for Print & Press) and shows for every job.

### Changed
- Press sheet and image list share one drawing module (`lib/pdf-draw.ts`); press sheet output is unchanged.

## [2.7.1] — 2026-10-21

### Fixed
- When Add to Cart fails (Drive not reachable, store rejected the line, …) the progress
  card now turns into a **"Something went wrong"** card with the message and a Close button.
  Before, the card just vanished and the error sat under the Add to Cart button behind the
  still-open preview, so it looked like nothing happened.

## [2.7.0] — 2026-10-21

### Added
- **Add to Cart progress card.** Clicking Add to Cart now opens a blocking status card
  that follows the whole run — building the print (+ cut) files sheet by sheet, packing
  the artwork, writing the press sheet (Print & Press), uploading to Google Drive with a
  real percentage, saving the project, adding to the cart, then "Added — taking you to your
  cart…" until the store page moves. It shows an elapsed-time counter, an overall bar with
  moving stripes while a step has no measurable progress, and a "nothing has timed out"
  note after 45 s. Inside the store iframe the card is placed next to where the customer
  clicked, not the middle of the (very tall) frame. Errors close the card and show the
  message under the button as before.
- **Print & Press: left chest logo.** The print location now offers **Left chest logo** and
  **Left chest logo + Back** alongside Front / Back / Front + Back. A left chest logo is
  billed as the front print (same first-side labor; chest + back is a double press). The
  front image slot is labelled "Left chest image", hints that logos run about 3–4 in wide,
  and warns when the chosen design is wider than 4.5 in. The press sheet shows a
  **LEFT CHEST** card and the cart/order line text reads "Left chest logo (+ Back)".

### WooCommerce plugin 1.28
- Location labels for `chest` / `chest-back` on cart rows, order meta and the order note.
  Pricing is unchanged, so 1.27 still charges correctly; it would only label chest lines as
  "Front".

## [2.6.3] — 2026-10-21

### Changed
- **Print & Press ladder is five tiers.** The $3.00 / +$1.25 price applies to **21–50**
  garments; **51–99** goes back to **$2.00 / +$1.00**. Full ladder: 1–10 $10 / +$2,
  11–20 $5 / +$1.50, 21–50 $3 / +$1.25, 51–99 $2 / +$1, 100+ $1.50 / +$0.75; names $0.50.

### WooCommerce plugin 1.27
- Same five-tier ladder in the server-side labor recompute. Install 1.27 with builder 2.6.3.

## [2.6.2] — 2026-10-21

### Changed
- **Print & Press 21–99 tier** is now **$3.00** first side and **+$1.25** second side
  (front + back $4.25). Other tiers unchanged: 1–10 $10 / +$2, 11–20 $5 / +$1.50,
  100+ $1.50 / +$0.75; names still $0.50.

### WooCommerce plugin 1.26
- Same ladder change in the server-side labor recompute. Install 1.26 with builder 2.6.2 —
  an older plugin would charge the old $2 / +$1 prices for 21–99 garment jobs.

## [2.6.1] — 2026-10-20

### Fixed
- Sheet 1's `… cut.plt` (uploaded by the server) was missing from the Drive file list the
  builder hands to the cart, so single-sheet pre-cut and Print & Press jobs had no **Cut file**
  link on the cart/order line and no `cutFileUrl` in the project JSON (sheets 2+ were fine).
  The cutter file is now listed with the other uploads. No plugin change.

## [2.6.0] — 2026-10-20

### Added
- **Print & Press add-on in the customer builder.** Customers who supply their own garments
  can have us press the transfers. A new panel under the design list takes one line per
  garment (garment, color, Front / Back / Front + Back, S–3XL counts, optional name roster)
  and which uploaded design goes on each side. Garment counts drive the design quantities
  (the quantity field locks to "Set by Print & Press garments"), so the gang sheet, the cut
  files, the bill and the press sheet always agree.
- Labor ladder per garment: **1–10 $10.00 · 11–20 $5.00 · 21–99 $2.00 · 100+ $1.50** for the
  first side, second side **+$2.00 / +$1.50 / +$1.00 / +$0.75**, plus **$0.50 per
  personalized garment**. Every Print & Press transfer is pre-cut; the builder's pre-cut fee is
  waived (labor covers it) and each sheet gets its matching `… cut.plt`.
- **Press sheet PDF** (`Customer 10/20 1400     Print & Press sheet.pdf`) is generated in the
  browser and uploaded to the same Drive folder as the PNGs/PLTs: file list with printed /
  cut / weeded tick boxes, size totals, one block per garment line with the front/back art,
  per-size pull/press boxes, the name roster and a counted-in / pressed / counted-out
  checklist, and the labor math in the footer.
- Project JSON records `product.printPress` (garments, tier, labor, lines, press sheet link).
- `lib/print-press.ts`, `lib/press-sheet-pdf.ts`, `components/print-press-panel.tsx`,
  `scripts/verify-print-press.mjs`.

### WooCommerce plugin 1.25
- Cart payloads may carry `printPress`; the plugin recomputes labor server-side from the
  garment counts (never trusts the browser total) and adds one **Print & Press labor
  (N garments)** cart fee per job. The pre-cut companion line is skipped under Print & Press
  while the job still carries `ssgs_precut = yes` for the cut files.
- Cart and order lines show **Print & Press** (tier, garments, double-press, names), the
  per-garment-line text (`Garment line N`), **Pre-cut fee: Included with Print & Press** and
  the **Press sheet** link; hidden `_ssp_print_press` / `_ssgs_pp_lines` keep the raw data.
  An order note repeats the full breakdown with the press sheet link.
- No new product or setting is needed — labor is a cart fee.

## [2.5.0] — 2026-10-15

### Fixed
- **Jobs longer than 200 in were built and billed as one 200 in sheet.** A 500 in order
  produced a single 200 in print file and a single $115 line. Both builders now pack the
  job onto as many 200 in sheets as it needs; 500 in becomes three sheets billed
  200 + 200 + 100 ($115 + $115 + $60 = $290), matching the price the page already showed.

### Added
- Every sheet is its own job part, labelled **`1 of 3`, `2 of 3`, `3 of 3`** on the printed
  film and in its file names (`Customer 10/15 1200 (200) 2 of 3.png`). With pre-cut on, each
  sheet gets its own matching `… 2 of 3 cut.plt`, so press and cutter stay paired.
- Customer builder and Shop Builder preview every sheet (sheet tabs + a pager in the full
  preview), list the per-sheet price lines, and upload all PNGs/PLTs to one Drive folder.
  Shop Builder downloads each sheet's PNG and PLT locally as before.
- Server-side Confirm & Build (`/api/project/ingest`) paginates the same way and returns
  `sheets[]` (sheet 1 also stays in the old `sheet` / `cut` fields).
- Project JSON records `product.sheetCount` and `product.sheets[]`.
- `lib/sheet-pages.ts` (`paginateGangSheet`, `splitBilledLength`) and
  `scripts/verify-sheet-pages.mjs`.

### WooCommerce plugin 1.24
- Cart payloads may carry `sheets[]`; the plugin adds **one line per sheet** on its own length
  variation, with its own pre-cut companion line, in a single request (the store page redirects
  to the cart on the first accepted line, which used to drop every request after it — the
  `/upload` flow with several files sends one request now too).
- Single-length payloads longer than the largest variation (intake, older builders) are
  split server-side into `n of N` lines; build fee and pre-cut are charged once on sheet 1.
- No more silent fallback to the largest variation when nothing fits.
- New line meta `ssgs_cut_file_name` / `ssgs_cut_file_url` (cart row **Cut file**).

## [2.4.0] — 2026-10-14

### Added
- **UV DTF in the WooCommerce plugin (1.23).** New *UV DTF product ID* setting (auto-detects
  slug `uv-dtf-stickers` / `uv-dtf`, or the first product with `pa_print_type = uv-dtf`).
  Cart payloads with `printType: 'uv-dtf'` land on that product, pick the variation by
  sheet length, and carry `Print type` plus `Cut: Square Cut 2.5 mm` / `Cut: No` meta
  (hidden `_ssp_cut_enabled` on order lines, spec A7). UV DTF never gets the DTF pre-cut
  companion line; the cut offset is always 2.5 mm server-side.
- New shortcode mode `[southside_gangsheet mode="stickers"]` → `/embed/stickers`, the UV DTF
  Sticker Maker in store mode: staff bars and local downloads hidden, **Add to Cart** uploads
  the sheet to Drive and sends the UV DTF line to WooCommerce.
- Order screens, emails, and receipts show readable labels for all `ssgs_*` line meta.

### Fixed
- Plugin 1.22 shipped with a PHP parse error in the checkout line-item hook, so it could not
  activate. Fixed; `ssgs_build_fee` is now also persisted on intake order lines.

## [2.3.8] — 2026-10-15

### Fixed
- Customer-site projects reopen with their artwork. Each design's art now uploads in the
  same Drive batch as the print PNG, and the project JSON (with art ids) is written
  **before** Add to Cart. Previously the art upload ran in the background and was cut
  off when the store page redirected to the cart, leaving every image as RE-UPLOAD.
- Upload-flow project JSON is likewise written before the cart redirect.
- Shop Builder and Sticker Maker no longer carry one customer's project id and Drive
  folder over to the next customer. Typing a different customer name starts a fresh
  project, so jobs stop sharing an id (and Reopen opens the right customer).
- Gang-sheet project JSON is labelled `printType: dtf` (it was `uv-dtf`); UV DTF is
  only written by the Sticker Maker.

## [2.3.7] — 2026-10-15

### Added
- **Server-side Confirm & Build for Mockup Pro** (`POST /api/project/ingest`): takes a
  `.ssp.json` project by URL and, with no browser, builds the print-ready gang sheet PNG
  (plus the PLT when pre-cut) and saves it in a new Drive job folder with the signed project
  JSON. Same restore, trimming, packing, ppi rule, label, CMYK mapping and cut marks as the
  shop's Confirm & Build. Auth: `x-ssgs-ingest-secret` = `MOCKUP_PRO_INGEST_SECRET`.
- `scripts/verify-ingest.mjs` checks it against the shop's own packing and rules.

### Changed
- Shop placements and sizes live in `lib/shop-sizes.ts` (shared with the server build).
- `sheetStamp` takes an optional time zone (the server stamps in shop time, America/Chicago).

## [2.3.6] — 2026-10-14

### Fixed
- Project JSON now lands in Drive even when design-art uploads fail: the
  `{Customer}.ssp.json` is written first with design metadata, then art is attached.
  Drive tagging/rename problems no longer make the write report as failed.
- Shop Builder gets a **Save Project** button (top right) and Sticker Maker **Save Job**
  writes to Drive before any sheet is built — the job folder is created on demand.
- Clear, specific error text when a Drive write fails, plus server-side logging.
- Connect Drive page: the test button now also writes a `Drive check.ssp.json` using the
  real project-JSON code path and reports which step failed.

## [2.3.5] — 2026-10-14

### Fixed
- Custom sizes are a footprint, not an orientation: a portrait design set to 12 × 9 in
  now prints 9 × 12 instead of shrinking to 6.75 × 9. The packer still turns designs
  to fit as many as possible on the sheet. Garment presets are unchanged.
- Reopened projects trim empty space around each design before sizing, so the chosen
  size applies to the artwork rather than its padding.

## [2.3.4] — 2026-10-14

### Fixed
- Reopen Project fully restores editable jobs: garment/shirt placement, print sizes
  (`sizeIn`), customer name, and design art from Drive — then auto-builds the gang
  sheet preview so the preview screen shows the sheet immediately.
- Project JSON no longer stores the composed sheet PNG as each design’s art id (that
  broke thumbs and preview on reopen). Missing art prompts a clear re-upload.

## [2.3.3] — 2026-10-14

### Fixed
- Project JSON (`{Customer}.ssp.json`) reliably lands in the Google Drive job folder again.
  Oversized embedded image data URLs were blowing past Vercel’s body limit, so the write
  failed silently. Design art is now uploaded into the folder separately; the JSON keeps
  only Drive file ids.
- Drive upsert no longer depends on fragile `name contains '.ssp.json'` search — folder
  children are listed and filtered in code so create/update succeeds.

## [2.3.2] — 2026-10-13

### Fixed
- Customer builder is phone-friendly: design rows stack as readable cards, placement
  grid and checkout controls fit small screens, and iOS no longer zoom-jumps on inputs.
- Staff top menu is hidden on customer storefront pages (`/`, `/upload`, `/send`, embeds)
  so shoppers keep the full screen for building.

## [2.3.1] — 2026-10-13

### Fixed
- Project JSON embeds design art (`dataUrl`) so Reopen Project shows the actual images
  instead of empty/black placeholders.
- Project JSON files are named after the project (`Customer Name.ssp.json`) instead of a
  fixed `project.ssp.json`. Legacy files still open and are renamed on the next save.

## [2.3.0] — 2026-10-09

### Added
- Shop Builder **Reopen Project** (top-right): search by customer / order / email / project ID,
  filter by source, recent list, upload `.ssp.json`, or paste a project link/ID.
- A `project.ssp.json` for **every** project — Shop Builder, customer site, and DTF Stickers —
  written to Google Drive automatically when files are created (`source`, `revision`, Drive
  appProperties for search).
- Shared `lib/project` auto-save + `/api/project/search` and `/api/project/open` for staff.

## [2.2.0] — 2026-10-09

### Added
- Top menu on every page: Shop Builder · DTF Stickers · Vinyl Stickers · Halftone Generator.
- Automatic project JSON: when files upload to Google Drive, `project.ssp.json` is created or
  updated in the same job folder (no extra Save click required for Drive jobs).

## [2.1.0] — 2026-10-09

### Changed
- Shop Sticker Maker is **UV DTF only** (22 in width locked, length min 12 in).
- Box 2 is Cut / No Cut only; Cut = fixed 2.5 mm Square Cut on every image.
- Per-image Square / Circle / Contour picks and border steppers removed.
- Vinyl product tab and vinyl media pagination removed from this app.
- Contour / circle cut tracing removed from `lib/custom-cut.ts` (Square Cut only).
- Vinyl sticker work parked in `docs/VINYL_STICKER_MAKER_SPEC.md` (separate project).
- Reopen Job rejects vinyl job files with a Vinyl Sticker Maker message; ignores legacy per-image shape / offsetMm.

### Removed
- Vinyl sticker maker UI and product mode from `/shop/sticker-maker`.
- Circle and contour cut modes from the DTF sticker maker.

## [2.0.0] — 2026-10-08

### Added
- Box 2 "Cut Options" right under Customer Name (No Cut by default).
- UV DTF: No Cut or Box Cut only. Vinyl stickers: No Cut or Add Contour Cut.
- Save Job / Reopen Job buttons right below Box 2 — sticker maker only.
- Border −/+ control (2 mm default, 0.5 mm steps) when cutting is on.
- Version number in the Sticker Maker page footer.

### Changed
- Sticker Maker step order: Customer name → Cut options → Save/Reopen → Upload → Size → Build.
