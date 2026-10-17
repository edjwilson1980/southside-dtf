# Changelog

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
