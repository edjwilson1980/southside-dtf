# Changelog

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
