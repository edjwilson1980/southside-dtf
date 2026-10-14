# Changelog

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
