# Gang Sheet Builder Add-on — UV DTF Cut Lines, Save/Reopen & Staff Tools

**Project:** Southside Gang Sheet Builder (Next.js 15, WooCommerce checkout)
**Where this goes:** `docs/GANGSHEET_ADDON_SPEC.md` — one spec for Cursor covering everything below.

| Part | What it covers | Applies to |
|---|---|---|
| **A. UV DTF / Vinyl Sticker Cut Lines** | "Add Contour Cut" toggle, Circle / Box / Contour, −/+ border, production cut file | UV DTF + vinyl sticker products |
| **B. Save & Reopen Projects + Staff Tools** | Google Drive project JSON, reopen, staff Fix mode, staff as-is JSON load, Photoshop export/import | Whole builder |

### Summary of decisions
- **"Add Contour Cut" checkbox** sits above the first image. **On** = every image gets a cut line. **Off** = the cut function is fully turned off.
- **Default cut** when no style is picked: a **Box** that hugs the image (rectangle or square, never padded out), **2 mm** border.
- **2 mm is the default border for every shape.** The −/+ buttons change it in 0.5 mm steps.
- Projects save as **JSON in Google Drive** and can be **reopened** to edit or fix.
- **Staff** get Fix mode, an **as-is JSON load** (exact layout, cuts and charged price), and a **Photoshop export with all originals** (art only, **no cut lines**) plus re-import.

---

# Part A — UV DTF / Vinyl Sticker Cut Lines

**Goal:** A single **"Add Contour Cut"** checkbox at the top of the image list turns cut lines on or off for the whole sheet. When it's on, every image gets a cut line and the customer can pick a cut shape (**Circle**, **Box**, **Contour**) and adjust the cut-line distance with **+ / −** buttons, with a live preview. When it's off, the cut function is completely disabled. Output a production-ready cut path the cutter/RIP will recognize.

**Scope:** UV DTF and vinyl sticker products only. Standard DTF transfers do **not** show the toggle or cut panels.

- A1. Master Toggle — "Add Contour Cut"
- A2. Per-Image Cut Panel (only visible when the master toggle is ON)
- A3. The Three Cut Shapes
- A4. The + / − Border Control
- A5. Preview Rendering
- A6. Production Output
- A7. Gang Sheet Nesting & Pricing
- A8. Data Model
- A9. File Structure
- A10. Feature Flag / Product Gating
- A11. Acceptance Criteria
- A12. Test Cases (`scripts/test-cutline.ts`)
- A13. Saving & Reopening
- A14. Out of Scope (later)

---

## A1. Master Toggle — "Add Contour Cut"

The toggle sits **above the first uploaded image**, at the top of the image list. It is the on/off switch for the entire cut-line feature.

```
┌──────────────────────────────────────────────────┐
│  ☑  Add Contour Cut to my stickers               │  ← master toggle
│     Cut lines will be added to every image.      │
├──────────────────────────────────────────────────┤
│  ┌──────┐  logo-front.png        [cut panel ▾]   │  ← image 1
│  └──────┘  Box · 2 mm  (default)                 │
├──────────────────────────────────────────────────┤
│  ┌──────┐  south-side-text.png   [cut panel ▾]   │  ← image 2
│  └──────┘  Contour · 3 mm                        │
├──────────────────────────────────────────────────┤
│  ┌──────┐  stars.png             [cut panel ▾]   │  ← image 3
│  └──────┘  Circle · 4 mm                         │
└──────────────────────────────────────────────────┘
```

### Checked (ON)
- **Every image** in the list gets a cut line, including images uploaded later.
- Each new image starts at the default: **Box, 2 mm**. See *Default cut* below.
- Each image has its own cut panel (Section A2) so the customer can change shape and border per image.
- Preview overlays, cut-footprint nesting, cut-based pricing and the `CutContour` production layer are all active.

### Unchecked (OFF)
- **The cut function is fully turned off.**
  - Per-image cut panels are hidden.
  - Magenta preview lines are removed from the canvas.
  - No cut paths are computed (the worker is not called).
- Nesting goes back to the bare art footprint with the normal gang-sheet spacing.
- The price goes back to the no-cut sheet length.
- The production PDF has **no `CutContour` layer** and no registration marks.
- No cut meta is saved to the order.

### Default cut — when no style is selected
If the toggle is ON and the customer hasn't picked a shape for an image, that image **automatically gets a Box cut at 2 mm** around the artwork.

- **Shape:** Box — a rectangle **or** square that hugs the image. It takes whatever shape the art's bounding box is: wide art → wide rectangle, tall art → tall rectangle, square art → square. **It is never forced into a square**, so no vinyl is wasted padding out wide or tall designs.
- **Corners:** square (radius 0). Rounded corners stay available as an opt-in.
- **Border:** 2 mm on all sides by default. The customer can change it with the − / + buttons next to it.
- **The image is never left without a cut line while the toggle is ON.** "No style selected" always means Box, 2 mm, and the preview shows it right away.
- The panel shows Box as the active shape so the customer can see what they're getting.

### Toggle behavior
- **Default state:** OFF. The customer opts in. Make this configurable with `CUT_DEFAULT_ENABLED=false`.
- **Turning OFF then back ON** restores each image's last shape and border for the current session. Settings are hidden while OFF, not deleted.
- **Turning it on or off re-nests the sheet and re-signs the price.** Show the new price right away.
- When toggled ON with images already uploaded, cut paths are computed for all images in the Web Worker. Show a small "Adding cut lines…" spinner on each image until its path is ready.
- The toggle label reads **"Add Contour Cut"**, the industry term customers know. "Contour" is also one of the three shapes inside each image's panel.

---

## A2. Per-Image Cut Panel (only visible when the master toggle is ON)

1. Customer selects a UV DTF or vinyl sticker product → checks **Add Contour Cut** → uploads artwork. The toggle can also be checked after upload.
2. Existing pipeline runs (background removal → `lib/alpha.ts` bleed/harden/choke → upscale if needed).
3. Each image's **Cut Line panel** is available. If the customer doesn't choose a style, the image defaults to a **Box cut (rectangle or square hugging the image), 2 mm**.
4. Customer clicks a shape → preview redraws instantly.
5. Customer taps **+** / **−** to grow or shrink the border → preview redraws instantly.
6. Size, gang-sheet footprint, and price update to match the cut shape (not the bare art).
7. Add to cart → cut settings for each image are saved to the order line item.
8. **Optional:** an "Apply to all images" link in any panel copies that image's shape and border to every image.

```
┌────────────────────────────────────────────┐
│  CUT SHAPE                                 │
│  ┌────────┐  ┌────────┐  ┌────────┐        │
│  │   ◯    │  │   ▢    │  │   ☁    │        │
│  │ Circle │  │ ✓ Box  │  │Contour │        │
│  └────────┘  └────────┘  └────────┘        │
│                                            │
│  BORDER (cut distance from art)            │
│   [ − ]     2 mm  (0.079 in)     [ + ]     │
│                                            │
│  Box only:  Rounded corners  [ off ]       │
│                                            │
│  Finished size: 3.25" × 2.90"              │
└────────────────────────────────────────────┘
```

---

## A3. The Three Cut Shapes

| Shape | What the customer gets | How it's built |
|---|---|---|
| **Circle** | Round sticker | Minimum enclosing circle of the art's outline (Welzl's algorithm on the convex hull), radius + offset |
| **Box** | Rectangle or square sticker, matching the art's proportions | Tight bounding box of the art + offset on all sides. Never padded out to a square — the box follows the image to avoid wasted material. **Square corners by default.** Rounded corners are opt-in (radius 1/16" when on). **This is the default shape when no style is selected.** |
| **Contour** (die-cut) | Follows the shape of the art | Trace the art outline from the alpha mask → offset outward with round joins → smooth → simplify |

### Contour cut rules (the hard one)
- **Trace from the hardened alpha**, using the same `ALPHA_THRESHOLD` as the underbase. The cut must match what actually prints.
- **Offset in vector space** with Clipper2 (`clipper2-js`), `JoinType.Round`, `EndType.Polygon`. Do not dilate pixels — vector offset is exact and resolution-independent.
- **Fill interior holes.** A "C" or donut shape gets one outer cut, no inner cut (inner cuts = weeding, out of scope).
- **Merge loose pieces.** If the art has separated parts (e.g., text with gaps), the offset usually merges them. If it's still more than one piece after offset:
  - Apply a "close" pass: offset out by +X then back in by −X (X = 1/16") to bridge small gaps.
  - If still separate → show warning: *"Parts of your design will cut as separate stickers. Increase the border or choose Box/Circle."*
- **Smooth** with 2 passes of Chaikin smoothing, then **simplify** (Ramer–Douglas–Peucker, tolerance ~0.005") so the cutter doesn't chatter on thousands of tiny segments.
- **Minimum inside-corner radius 1/32"** — sharp inside notches tear vinyl.

---

## A4. The + / − Border Control

| Setting | Value |
|---|---|
| Unit shown to customer | **Millimeters**, with inches in grey (e.g. `2 mm (0.079")`) |
| Step per click | **0.5 mm** |
| Default | **2 mm for every shape** (Box, Circle and Contour). Switching shapes keeps whatever border the customer has set. |
| Minimum | **0.5 mm** for Contour and Circle, **0 mm** for Box (edge-to-edge rectangle allowed) |
| Maximum | **12 mm (≈ 1/2")** |
| Hold-to-repeat | Yes — holding + or − steps every 120 ms |
| Keyboard | `+` / `=` grows, `-` shrinks when panel is focused |

- **−** button disables at the minimum, **+** disables at the maximum.
- Below **1.5 mm** on Contour or Circle, show a soft warning: *"Very tight border — small cutting shifts may clip your art."*
- The offset is a **physical distance** (mm), so the border stays the same when the customer resizes the sticker.
- The server **clamps every offset to the allowed min/max**, even if a modified browser sends something outside it.

---

## A5. Preview Rendering

- Draw the cut path as a **magenta dashed line (2px, dash 6/4)** over the art on the existing canvas.
- Shade the area between the art and the cut line a light grey (`rgba(0,0,0,0.06)`) so customers can see the "white border" they're buying. For UV DTF that border is clear unless they add a backing — show a note if that applies.
- Recompute on every shape/offset change. Target **< 50 ms** — trace once on upload and cache the traced outline; only the offset/shape step reruns on clicks.
- Run tracing in a **Web Worker** so large uploads don't freeze the page.

---

## A6. Production Output

The cut path must ship in a format the cutter's RIP reads automatically.

- **Spot color name:** `CutContour` (Roland VersaWorks / Mimaki / Summa / Graphtec convention). Make the name a config value: `CUT_SPOT_NAME`.
- **Stroke:** 0.25 pt, 100% magenta (`C0 M100 Y0 K0`), no fill.
- **Production file:** PDF with the art on one layer and the `CutContour` path on its own layer as a **Separation** color space. Also export an SVG of just the cut paths for debugging.
- **Registration marks:** Add 3 corner OPOS/crop marks around the full gang sheet (configurable: `CUT_REG_MARKS=opos|crop|none`).
- **Source of truth is the server.** The client preview and the server use the **same `lib/cutline` code**. On add-to-cart, the server recomputes the cut path from the stored upload + settings — never trust a cut path sent from the browser.

---

## A7. Gang Sheet Nesting & Pricing

- **MaxRects nesting must use the cut-shape bounding box**, not the art's bounding box. A 1/2" border makes every piece 1" bigger.
- **Gap between pieces:** minimum **1/8"** between cut lines (`CUT_MIN_GAP_IN`), so the blade doesn't cut neighbors.
- **Circle shapes** nest as their bounding square (keep MaxRects deterministic — no polygon nesting).
- **Price** = sheet length after nesting with cut footprints → still **HMAC-signed server-side**. Shape and offset are part of the signed payload, so changing either requires a fresh signature.

---

## A8. Data Model

```ts
// types/cutline.ts
export type CutShape = 'circle' | 'box' | 'contour';

// Sheet-level master switch (the "Add Contour Cut" checkbox)
export interface SheetCutState {
  enabled: boolean;                       // false = cut function fully off
  perImage: Record<string, CutSettings>;  // keyed by image id; kept while OFF so it restores
}

export interface CutSettings {
  shape: CutShape;
  offsetMm: number;           // physical mm, step 0.5, default 2, min 0.5 (0 for box), max 12
  boxCornerRadiusIn?: number; // box only, default 0 (square), 0.0625 when rounded is on
}

export interface CutResult {
  paths: Array<Array<[number, number]>>; // inches, relative to art origin
  bboxIn: { x: number; y: number; w: number; h: number };
  pieceCount: number;         // >1 triggers the "separate stickers" warning
  warnings: CutWarning[];
}

export type CutWarning = 'TIGHT_BORDER' | 'MULTIPLE_PIECES' | 'ART_TOO_SMALL';

// Default applied when no style is selected
export const DEFAULT_CUT: CutSettings = { shape: 'box', offsetMm: 2, boxCornerRadiusIn: 0 };
```

### WooCommerce line-item meta
| Meta key | Example |
|---|---|
| `_ssp_cut_enabled` | `yes` / `no` |
| `_ssp_cut_images` | JSON array, one entry per image: `[{"image":"logo-front.png","shape":"box","offsetMm":2,"cornerRadiusIn":0,"pieceCount":1}]` |
| Visible to customer | `Contour Cut: On`, then one line per image: `logo-front.png — Box, 2 mm border` |

When `_ssp_cut_enabled` = `no`, `_ssp_cut_images` is not written and the customer sees `Contour Cut: Off`.

`enabled` and every image's settings are part of the **HMAC-signed payload**, so flipping the toggle needs a fresh price signature.

---

## A9. File Structure

```
lib/cutline/
  trace.ts        // alpha mask → outer polygon(s) (marching squares), fill holes
  offset.ts       // Clipper2 offset, close pass, merge pieces
  shapes.ts       // circle (Welzl), box (+ rounded corners), contour
  smooth.ts       // Chaikin smoothing + RDP simplify
  export.ts       // SVG path + PDF CutContour separation layer
  constants.ts    // step, min, max, default, spot name, gap
  index.ts        // buildCutPath(mask, settings, dpi): CutResult
workers/
  cutline.worker.ts
components/
  CutToggle.tsx         // "Add Contour Cut" master checkbox above the first image
  CutlinePanel.tsx      // per-image shape picker + +/- stepper + warnings
  CutlineOverlay.tsx    // dashed magenta preview on canvas
app/api/cutline/route.ts // server recompute for cart + production
scripts/
  test-cutline.ts
```

### Config (`.env`)
```
CUT_DEFAULT_ENABLED=false
CUT_SPOT_NAME=CutContour
CUT_DEFAULT_SHAPE=box
CUT_DEFAULT_OFFSET_MM=2
CUT_STEP_MM=0.5
CUT_MIN_OFFSET_MM=0.5
CUT_MIN_OFFSET_MM_BOX=0
CUT_MAX_OFFSET_MM=12
CUT_MIN_GAP_IN=0.125
CUT_REG_MARKS=opos
```

### Dependencies
```
npm i clipper2-js pdf-lib
```
(Marching squares, Welzl, Chaikin and RDP are small enough to write in-house — no extra packages.)

---

## A10. Feature Flag / Product Gating

- Show the **"Add Contour Cut" toggle** only when the product has the WooCommerce attribute `pa_print_type` = `uv-dtf` or `vinyl-sticker`.
- Per-image cut panels appear only when the product qualifies **and** the toggle is checked.
- Standard DTF products never show the toggle. They skip the cut step entirely and nest exactly as they do today.

---

## A11. Acceptance Criteria

- [ ] The "Add Contour Cut" toggle appears above the first image, only for UV DTF / vinyl sticker products.
- [ ] The toggle is OFF by default.
- [ ] Toggle OFF: no cut panels, no preview lines, no cut computation, no `CutContour` layer, no cut meta, and price/nesting use bare art.
- [ ] Toggle ON: every image, including ones uploaded later, gets a cut line and its own panel.
- [ ] Toggling OFF → ON restores each image's previous shape and border.
- [ ] Flipping the toggle re-nests the sheet and updates the signed price immediately.
- [ ] An image with no style selected gets a Box cut at 2 mm that hugs the image (rectangle or square, never padded to a square).
- [ ] Every shape starts at 2 mm, and − / + change it.
- [ ] Switching shapes updates the preview in under 50 ms after first trace.
- [ ] + / − step by 0.5 mm, stop at the minimum (0.5 mm, or 0 for Box) and 12 mm; hold-to-repeat works.
- [ ] Contour cut has no inner cuts and no inside corners tighter than 1/32".
- [ ] Separated artwork shows the "separate stickers" warning when it can't merge.
- [ ] Gang sheet nesting uses cut footprints with a 1/8" minimum gap.
- [ ] Price changes when shape/offset changes, and stays HMAC-signed.
- [ ] Production PDF opens in VersaWorks (or the shop's cutter RIP) with the cut path auto-detected as `CutContour`.
- [ ] Order line item shows the cut shape and border in admin and on the customer's receipt.

## A12. Test Cases (`scripts/test-cutline.ts`)

| Input art | Expected |
|---|---|
| Solid circle logo | Contour ≈ Circle result |
| Square logo | Contour ≈ Box result |
| Donut / ring | One outer cut, no inner cut |
| "SOUTH SIDE" text with letter gaps | Contour merges into one piece at 3 mm |
| Two logos far apart | `MULTIPLE_PIECES` warning |
| Star with sharp points | Smooth rounded outer cut, no spikes |
| 3 images, toggle ON → OFF → ON | No cut output while OFF; original per-image settings return when back ON |
| Wide 6" × 2" banner, no style picked | Box is a 6.16" × 2.16" rectangle, not a square |
| Toggle ON, then upload a 4th image | 4th image gets a 2 mm Box cut automatically |
| 0.5" tiny art at max offset | Valid path, `ART_TOO_SMALL` warning if under 0.5" |

---

## A13. Saving & Reopening

The toggle state and every image's cut settings are stored in the project JSON file. Reopening a project restores them exactly. On a normal reopen, cut paths and price are recomputed. The one exception is the staff **as-is** load (Section B5.2), which uses the exact cut lines and price from the order snapshot. See Part B.

---

## A14. Out of Scope (later)

- Interior / weeding cuts
- Kiss-cut vs. through-cut selection per piece
- Custom drawn cut paths
- True-shape polygon nesting

---

# Part B — Save & Reopen Projects + Staff Tools

**Goal:** Save the full gang-sheet project as a **JSON file in Google Drive**, and add a **Reopen Project** feature so the customer or shop staff can open it later to edit or fix it.

**Scope:** The whole builder: standard DTF, UV DTF and vinyl stickers.

- B1. What the Customer Sees
- B2. When a Project Is Saved
- B3. Google Drive Layout
- B4. Project File Format (`.ssp.json`)
- B5. Reopening a Project
- B6. Staff Photoshop Export (PSD)
- B7. Access & Security
- B8. Google Drive Connection
- B9. n8n Hook (optional)
- B10. File Structure
- B11. Acceptance Criteria
- B12. Test Cases (`scripts/test-project-roundtrip.ts`)
- B13. Out of Scope (later)

---

## B1. What the Customer Sees

```
┌──────────────────────────────────────────────────────────────┐
│  GANG SHEET BUILDER                                          │
│  [ 💾 Save Project ]   [ 📂 Reopen Project ]   Saved 2:41 PM ✓  │
├──────────────────────────────────────────────────────────────┤
│  ☑  Add Contour Cut to my stickers                           │
│  ┌──────┐  logo-front.png ...                                │
```

- **Save Project:** saves to Google Drive and shows "Saved 2:41 PM ✓". The first save also shows a reopen link the customer can copy or bookmark.
- **Reopen Project:** opens a dialog with three options:
  1. **My recent projects** — projects tied to the logged-in WooCommerce account.
  2. **Upload project file** — a `.ssp.json` file downloaded earlier.
  3. **Paste reopen link** — `southsidedtf.com/builder?project=<id>&t=<token>`
- **Download project file:** a small link under Save that downloads the same `.ssp.json` to the customer's computer.

```
┌─────────────────────────────────────────────┐
│  REOPEN PROJECT                         ✕   │
│                                             │
│  Recent                                     │
│   • Crash Out Club drop 3   Oct 8, 2:41 PM  │
│   • Fire Dept stickers      Oct 2, 9:15 AM  │
│                                             │
│  [ Upload .ssp.json file ]                  │
│  [ Paste reopen link ___________________ ]  │
└─────────────────────────────────────────────┘
```

---

## B2. When a Project Is Saved

| Trigger | What happens |
|---|---|
| **Save Project** button | Save now, new Drive revision |
| **Autosave** | Every 60 s while there are unsaved changes, plus on page hide/close (`visibilitychange`) |
| **Add to cart** | Save, and lock that version to the cart item |
| **Order placed** (WooCommerce webhook / n8n) | Copy the locked version into the order folder as `order-<orderId>.ssp.json` |

- Autosave is quiet: the status reads "Saving…" then "Saved ✓".
- If a save fails (offline, Drive down), keep the project in `localStorage` as a backup and retry with backoff. Show "Not saved — retrying" in red.

---

## B3. Google Drive Layout

```
Gang Sheet Projects/                      ← GDRIVE_ROOT_FOLDER_ID
  2026-10/
    prj_8f3k2a/                          ← one folder per project
      project.ssp.json                   ← latest version (Drive keeps revision history)
      originals/
        img_01_logo-front.png            ← exactly what the customer uploaded
      processed/
        img_01_logo-front.png            ← after bg removal + alpha fix + upscale
      production/
        order-48213.pdf                  ← print + CutContour file (after order)
      staff-exports/
        prj_8f3k2a_order-48213_photoshop.zip  ← staff PSD export (Section B6)
      order-48213.ssp.json               ← frozen copy of what was ordered
```

- **Images are not embedded in the JSON.** They're stored as files next to it and referenced by Drive file ID + SHA-256. This keeps the JSON small and the images print-quality.
- Images are uploaded once, on upload. The SHA-256 check skips files Drive already has.
- **Revisions:** overwrite `project.ssp.json` on each save. Drive keeps the revision history automatically. Mark the add-to-cart version **"Keep forever"** (`keepRevisionForever: true`).
- Nothing in the folder is shared publicly. The browser never gets Drive links; the app server proxies every read and write.

---

## B4. Project File Format (`.ssp.json`)

```json
{
  "format": "ssp-gangsheet-project",
  "schemaVersion": 1,
  "projectId": "prj_8f3k2a",
  "name": "Crash Out Club drop 3",
  "createdAt": "2026-10-08T19:41:00Z",
  "updatedAt": "2026-10-08T19:55:12Z",
  "owner": { "wcCustomerId": 1182 },
  "product": {
    "wcProductId": 512,
    "printType": "uv-dtf",
    "rollWidthIn": 22
  },
  "sheet": {
    "nesting": "maxrects",
    "gapIn": 0.125
  },
  "cut": {
    "enabled": true
  },
  "images": [
    {
      "id": "img_01",
      "fileName": "logo-front.png",
      "original":  { "driveFileId": "1AbC…", "sha256": "9f2…", "pxW": 3000, "pxH": 2400 },
      "processed": { "driveFileId": "1DeF…", "sha256": "c71…", "pxW": 3000, "pxH": 2400 },
      "pipeline": { "bgRemoved": true, "upscaled": false, "alphaChokePx": 2 },
      "sizeIn": { "w": 4.0, "h": 3.2 },
      "quantity": 10,
      "rotationDeg": 0,
      "cut": { "shape": "box", "offsetMm": 2, "boxCornerRadiusIn": 0 }
    }
  ],
  "orderRefs": [],
  "snapshot": null,
  "sig": "hmac-sha256:5b1e…"
}
```

### `snapshot` block (staff / ordered files only)
Written when an order is frozen, when staff save in Fix mode, and when staff download the project JSON. It records the project **exactly as it was produced**, so staff can load it as-is (Section B5.2).

```json
"snapshot": {
  "frozenAt": "2026-10-08T20:02:44Z",
  "orderId": 48213,
  "codeVersion": { "builder": "1.4.2", "cutline": "1.1.0", "alpha": "1.0.3" },
  "sheet": { "widthIn": 22, "lengthIn": 64.5 },
  "placements": [
    { "imageId": "img_01", "copy": 1, "xIn": 0.25, "yIn": 0.25, "rotationDeg": 0 },
    { "imageId": "img_01", "copy": 2, "xIn": 4.55, "yIn": 0.25, "rotationDeg": 0 }
  ],
  "cutPaths":      { "driveFileId": "1GhI…", "sha256": "a04…" },
  "productionPdf": { "driveFileId": "1JkL…", "sha256": "e19…" },
  "pricing": { "chargedTotal": "35.48", "currency": "USD", "displayOnly": true }
}
```

### Rules
- **Saved:** everything needed to rebuild the project exactly, including sizes, quantities, rotation, pipeline settings, the cut toggle and each image's cut settings.
- **Normal reopen ignores the snapshot.** Price, nested layout and cut paths are **recomputed** from the saved inputs, so a customer always gets current prices and the current cut code. Only the staff **as-is** load (Section B5.2) uses the snapshot.
- **`sig`** is an HMAC of the file contents (same secret as pricing). On reopen, a missing or invalid signature means the file was edited by hand:
  - **Customer reopen:** reject it with *"This project file was changed outside the builder and can't be opened."*
  - **Staff reopen:** allow it, with a warning banner.
- **`schemaVersion`:** `lib/project/migrate.ts` upgrades old files step by step (v1 → v2 → …) so old projects always open.

---

## B5. Reopening a Project

### B5.1 Normal reopen (customers and staff)

1. Load the JSON from Drive (by `projectId`) or from the uploaded file.
2. Validate it with a **zod** schema. On failure, show the field that's wrong instead of a blank screen.
3. Check `sig` and access (see Section B7).
4. Run migrations if `schemaVersion` is older.
5. Fetch the **processed** images through the server. If one is missing from Drive, re-run the pipeline from the **original**. If both are missing, show a placeholder with "Re-upload this image" in that image's slot.
6. Rebuild the builder state: images, sizes, quantities, cut toggle and per-image cut settings.
7. Recompute nesting, cut paths and the **signed price**.
8. Show a banner: *"Reopened 'Crash Out Club drop 3' — last saved Oct 8, 2:55 PM."*

### Reopening a project that was already ordered
- **Customer:** the project opens as an **editable copy** (new `projectId`, name + " (copy)"). Adding it to the cart is a new order; the placed order is never changed.
- **Staff "Fix" mode** (`?project=<id>&mode=fix`, admin only): edit the ordered version directly to fix art, sizing or cut lines. Then regenerate production files into `production/` as `order-<orderId>-r2.pdf` and record who changed what in the `orderRefs` notes. The customer's price does not change in Fix mode.

### B5.2 Staff: Load Project JSON (as-is)

Staff can load any `.ssp.json`, from Drive or from their computer, **exactly as it was saved**, with nothing recalculated. This is for checking what was printed, reprinting an order identically, or troubleshooting.

```
┌──────────────────────────────────────────────────────────────────┐
│  STAFF                                                           │
│  [ 📂 Load project JSON ▾ ]                                       │
│      ├ As-is (exact layout, price & cuts)     ← staff default    │
│      └ Rebuild (current prices & cut code)    ← same as 5.1      │
│  From:  ( • ) Drive project / order #  ______    ( ) Upload file  │
└──────────────────────────────────────────────────────────────────┘
```

**As-is means:**
| Item | As-is load | Rebuild load |
|---|---|---|
| Layout | Exact `snapshot.placements`, nothing re-nested | Re-nested |
| Cut lines | Loaded from `snapshot.cutPaths` | Recomputed |
| Images | The exact processed files by SHA-256; the pipeline is **not** re-run | Rebuilt from original if missing |
| Price | Shows `chargedTotal`, read-only | Recomputed + re-signed |
| Code versions | Banner shows the versions it was made with | Current versions |
| Bad / missing `sig` | Loads, with a red "edited outside the builder" banner | Same |

**Rules:**
- **If a file in the snapshot is missing or its SHA-256 doesn't match**, stop and say which one (*"img_02 processed file changed since order #48213"*). Offer **Rebuild** instead. Never fill the gap silently, or "as-is" stops being true.
- **If the file has no snapshot** (a plain customer save), as-is loads the saved inputs and nests them once, with the banner *"No layout snapshot in this file — layout was rebuilt."*
- **Old `schemaVersion` files** are migrated in structure only; snapshot values (positions, price, cut paths) are kept unchanged.
- **Read-only until staff make a change.** The first edit asks: *"Edit this layout? Changed images will get new cut lines; nothing else moves."*
  - Edited images get recomputed cut lines in place; all other placements stay exactly where they were.
  - A **Re-nest sheet** button re-packs everything only when staff click it.
  - Saving writes a new snapshot and production files as `-r2`, `-r3`, ….
- **Reprint identically:** an as-is load with no edits can send the original `productionPdf` straight to production, or regenerate it. The regenerated PDF must match the original's SHA-256; if it doesn't, warn that the code changed since the order.
- **Download project JSON** (staff) always includes the current snapshot, so the file can be loaded as-is later on any computer.

---

## B6. Staff Photoshop Export (PSD)

**Staff only** (WP `manage_woocommerce`), available in Fix mode and from any staff-opened project. It gives staff a fully layered Photoshop file plus every original upload, so advanced edits happen in Photoshop instead of the builder.

```
┌──────────────────────────────────────────────────────────────┐
│  STAFF · Fix mode · Order #48213                              │
│  [ 💾 Save ]  [ 📂 Load project JSON ▾ ]  [ ⬇ Download project JSON ] │
│  [ ⬇ Export to Photoshop ▾ ]  [ ⬆ Import edited PSD ]           │
│                 ├ Per-image PSDs (zip)      ← default          │
│                 └ Full gang sheet PSD/PSB                     │
└──────────────────────────────────────────────────────────────┘
```

### B6.1 What's in the export (one `.zip`)

```
prj_8f3k2a_order-48213_photoshop.zip
  per-image/
    img_01_logo-front.psd          ← one layered PSD per image (default)
    img_02_south-side-text.psd
  full-sheet/
    gangsheet_order-48213.psd      ← only if "Full gang sheet" was chosen (.psb if huge)
  originals/
    img_01_logo-front.png          ← untouched customer uploads, original format & resolution
    img_02_south-side-text.ai
  project.ssp.json                 ← signed project file with snapshot — loads as-is
  README.txt                       ← layer naming rules (Section B6.4)
```

- **Originals are always included unchanged**, whatever their format (PNG, JPG, PDF, AI, SVG, PSD). Staff can go back to the customer's real file at any time.
- The zip is also saved to the project's Drive folder under `staff-exports/`, so anyone on staff can grab it later.

### B6.2 Layer structure

**No cut lines in the Photoshop files.** Staff will usually take images apart and rework them, and each finished image goes back into its slot in the builder, which draws the cut line at that point (Section B6.4). Cut lines in the PSD would only get in the way.

**Per-image PSD** (canvas = the art's printed size, no cut border, **300 DPI**, RGB 8-bit, tagged sRGB):

```
img_01_logo-front.psd
 └─ 📁 ART
      ├─ PROCESSED                ← print-ready art (bg removed, alpha fixed, upscaled)  ✓ visible
      └─ ORIGINAL                 ← original upload, same size/position                  hidden
```

**Full gang sheet PSD** (canvas = 22" × sheet length, 300 DPI):
- One group per placed copy, named `img_01 #3 · logo-front · 4.0×3.2in`. Each group holds the same `ART` layers as the per-image file, positioned exactly as nested.
- A locked, hidden `_GUIDES` layer shows the sheet edge only.

### B6.3 Size limits (why per-image is the default)

- A 22" sheet at 300 DPI is 6,600 px wide; a 200" sheet is 60,000 px tall. Photoshop's **PSD limit is 30,000 px**, so anything taller is written as **`.psb`** (Large Document Format) automatically.
- Full sheets are very heavy (a 200" sheet ≈ 1.5 GB in memory). Full-sheet export is limited to **`PSD_FULLSHEET_MAX_IN`** (default 120") of sheet length. Over that, the button greys out with *"Sheet too long — use per-image PSDs."*
- Per-image files stay small and fast and cover almost every real fix (cleaning art, fixing edges, recoloring, retouching).
- Exports run as a **background job**, not inside the request. Show "Building PSD… 40%", then a download button. A 30-image sheet should finish in under a minute.

### B6.4 Re-import the edited PSD (closing the loop)

After editing in Photoshop, staff click **Import edited PSD** and drop the edited per-image `.psd`, several of them, or the whole zip.

1. Match each file to its image by the **`img_XX` prefix** in the file name (or group name for full-sheet files).
2. Take the **ART group**, merged with only the visible layers, as the new processed image. Hidden layers (like ORIGINAL) and `_GUIDES` are ignored.
3. Keep the physical size from the canvas size at 300 DPI. If staff resized the canvas, show the new size for confirmation.
4. Optionally re-run the alpha harden/choke step (`lib/alpha.ts`). It's checked by default so edges stay clean for the underbase.
5. Put the new art back in its slot and **draw the cut line from the new art**, using that image's cut shape and border (and only if the Add Contour Cut toggle is on). Other images don't move.
6. Save the project and write new production files as `order-<orderId>-r2.pdf`. Record in `orderRefs` notes that image X was replaced from a PSD, by whom and when.

**Naming rules (also in `README.txt`):** don't rename the file's `img_XX` prefix or the `ART` group. Anything else (extra layers, adjustment layers, masks inside ART) is fine; it gets flattened on import.

### B6.5 Tech notes
- Library: **`ag-psd`** (Node) to write and read PSD/PSB with groups, hidden/locked layers and layer names. Use **`archiver`** for the zip.
- Adjustment layers and smart objects inside ART are flattened on import from the composite Photoshop saves. **Staff must save with "Maximize Compatibility" on** (Photoshop's default), or the composite is missing. Show that error clearly if it happens.
- The PSD carries art only. Cut lines exist only in the builder and the production PDF's `CutContour` layer.
- Run the export worker on the Node runtime (not edge) with enough memory (≥ 3 GB for full sheets).

---

## B7. Access & Security

| Who | Can reopen |
|---|---|
| Logged-in customer | Their own projects (`owner.wcCustomerId` matches) |
| Guest with reopen link | The one project in the link. The `t` token is an HMAC of `projectId`; it never expires, but staff can revoke it by rotating the project's `linkSalt` |
| Uploaded `.ssp.json` | Only when `sig` is valid. Its images load only from that project's own Drive folder |
| Staff (WP `manage_woocommerce`) | Any project, including Fix mode, as-is JSON load, PSD export and PSD import |

- The Drive credentials live **only on the server**.
- Rate-limit `/api/project/*` (e.g. 30 requests/min per IP).
- Upload size limit for `.ssp.json`: 1 MB. A real project file is a few KB.

---

## B8. Google Drive Connection

- **Default: OAuth refresh token for the shop's Google account.** Authorize once with `scripts/gdrive-auth.ts`, then store the refresh token in `.env`. This works with a regular Gmail account.
- **Workspace option: service account + Shared Drive.** Service accounts have no storage of their own in My Drive, so this only works with a Shared Drive (`GDRIVE_SHARED_DRIVE_ID`).
- Scope: `https://www.googleapis.com/auth/drive.file`. The app can only see files it created, nothing else in the account.
- Use **resumable uploads** for images over 5 MB.
- Packages: `googleapis`, plus `ag-psd` and `archiver` for the PSD export.

### Config (`.env`)
```
GDRIVE_AUTH_MODE=oauth            # oauth | service_account
GDRIVE_CLIENT_ID=
GDRIVE_CLIENT_SECRET=
GDRIVE_REFRESH_TOKEN=
GDRIVE_SERVICE_ACCOUNT_JSON=      # only for service_account mode
GDRIVE_SHARED_DRIVE_ID=           # only for service_account mode
GDRIVE_ROOT_FOLDER_ID=
PROJECT_AUTOSAVE_SECONDS=60
PROJECT_HMAC_SECRET=              # can reuse the pricing secret
PSD_DPI=300
PSD_FULLSHEET_MAX_IN=120
PSD_REIMPORT_ALPHA_FIX=true
```

---

## B9. n8n Hook (optional)

The existing n8n order automation already talks to WooCommerce and Google Drive. On **order placed**, n8n can:
1. call `POST /api/project/freeze` with the order ID to create `order-<orderId>.ssp.json`, and
2. drop the production PDF into the same project folder.

This way the order, the project file and the print file all sit in one Drive folder.

---

## B10. File Structure

```
lib/project/
  schema.ts         // zod schema + TS types for .ssp.json
  serialize.ts      // builder state → project JSON (+ sig)
  hydrate.ts        // project JSON → builder state (+ recompute price/nesting/cuts)
  hydrateAsIs.ts    // project JSON + snapshot → exact builder state, nothing recomputed
  snapshot.ts       // write snapshot (placements, cut paths, PDF refs, versions, charged price)
  migrate.ts        // schemaVersion upgrades
  sign.ts           // HMAC sign/verify, reopen-link tokens
lib/gdrive/
  client.ts         // auth (oauth | service_account)
  folders.ts        // ensure month/project/subfolders exist
  files.ts          // upload (resumable), download, overwrite, keepForever
app/api/project/
  save/route.ts     // POST — save/autosave
  open/route.ts     // GET  — by projectId + token or session
  upload/route.ts   // POST — open from uploaded .ssp.json
  load-asis/route.ts   // POST — staff: load JSON exactly from snapshot (Drive id or upload)
  download/route.ts    // GET  — staff: project JSON with current snapshot
  list/route.ts     // GET  — "My recent projects"
  freeze/route.ts   // POST — order snapshot (WooCommerce webhook / n8n)
  image/route.ts    // GET  — server proxy for Drive images
  psd-export/route.ts  // POST — staff: start PSD export job, GET status/download
  psd-import/route.ts  // POST — staff: import edited PSD(s) or zip
lib/psd/
  export.ts         // build per-image + full-sheet PSD/PSB with ag-psd
  import.ts         // read PSD, match img_XX, flatten visible ART group
  layers.ts         // shared layer/group naming rules
components/
  ProjectBar.tsx        // Save / Reopen / status / download link
  ReopenDialog.tsx      // recent list, file upload, paste link
  StaffPsdMenu.tsx      // Export to Photoshop / Import edited PSD (staff only)
  StaffLoadMenu.tsx     // Load project JSON (As-is / Rebuild), Download project JSON
hooks/
  useAutosave.ts
scripts/
  gdrive-auth.ts        // one-time OAuth to get the refresh token
  test-project-roundtrip.ts
  test-psd-roundtrip.ts
```

---

## B11. Acceptance Criteria

- [ ] **Save Project** creates a Drive project folder with `project.ssp.json`, `originals/` and `processed/`.
- [ ] Autosave runs every 60 s when there are changes and on page close; the status shows Saving… / Saved ✓ / Not saved.
- [ ] **Download project file** gives the same JSON, with a valid `sig`.
- [ ] **Reopen** works from the recent list, an uploaded file, and a pasted link.
- [ ] A reopened project matches the original: images, sizes, quantities, rotation, cut toggle, and each image's cut shape and border.
- [ ] Price, nesting and cut paths are recomputed on reopen, never read from the file.
- [ ] A hand-edited file (bad `sig`) is rejected for customers and opens with a warning for staff.
- [ ] Reopening an ordered project makes a copy for customers; staff Fix mode edits in place and writes `-r2` production files.
- [ ] A missing processed image is rebuilt from the original; if both are missing, that slot shows "Re-upload this image."
- [ ] Customers can't open other customers' projects.
- [ ] Drive credentials never reach the browser.
- [ ] Staff can export per-image PSDs (zip) with an ART group (PROCESSED + hidden ORIGINAL) and **no cut lines**, plus all originals untouched and the project file.
- [ ] Full-sheet export writes PSD, or PSB when over 30,000 px, and is blocked over `PSD_FULLSHEET_MAX_IN`.
- [ ] The export zip is also saved to the project's `staff-exports/` folder in Drive.
- [ ] Importing an edited PSD replaces that image's art, recomputes cuts and writes `-r2` production files.
- [ ] PSD export and import buttons are invisible and blocked (403) for customers.
- [ ] Staff **Load project JSON → As-is** restores the exact layout, cut lines, images and charged price from the snapshot, with nothing re-nested or recomputed.
- [ ] A missing or changed snapshot file stops the as-is load with a clear message and offers Rebuild.
- [ ] Editing an as-is project only recomputes cuts for changed images; re-nesting happens only on **Re-nest sheet**.
- [ ] Regenerating production from an unedited as-is load produces a PDF with the same SHA-256 as the original.
- [ ] Staff **Download project JSON** always includes a current snapshot; as-is load is blocked (403) for customers.

## B12. Test Cases (`scripts/test-project-roundtrip.ts`)

| Scenario | Expected |
|---|---|
| Build 3 images with mixed cuts → save → reopen | Identical builder state; price re-signed |
| Change a price field by hand in the JSON | Price ignored (recomputed); `sig` fails → customer rejected |
| `schemaVersion: 0` fixture | Migrates and opens |
| Delete a processed image in Drive | Rebuilt from the original on reopen |
| Customer B opens Customer A's link with no token | 403 |
| Kill network mid-autosave | Copy kept in localStorage; retries; "Saved ✓" once back online |
| Reopen ordered project as customer | Opens as "(copy)" with a new `projectId` |
| Staff export 3 images → open in Photoshop | Each PSD has the ART group, correct layer names, 300 DPI and art size, and no cut lines |
| Edit `img_02` in Photoshop (recolor + add adjustment layer) → import | `img_02` art updated, cut recomputed, `-r2` PDF written, other images untouched |
| Import a PSD with the `img_XX` prefix removed | Clear error: "Can't match this file to an image — keep the img_XX name." |
| Full sheet 150" long | Full-sheet option disabled; per-image export still works |
| Full sheet 110" long (33,000 px) | Written as `.psb` |
| Customer calls `/api/project/psd-export` | 403 |
| Staff load `order-48213.ssp.json` as-is | Same placements, cut lines and $35.48 shown; nothing re-nested |
| Same file, after a price increase | As-is still shows $35.48; Rebuild shows the new price |
| As-is load after img_02's processed file was replaced in Drive | Stops: "img_02 processed file changed since order #48213" + Rebuild option |
| As-is load → resize img_01 → save | Only img_01 cuts change; others stay put; `-r2` files written |
| As-is load of a customer file with no snapshot | Loads with "layout was rebuilt" banner |
| Customer calls `/api/project/load-asis` | 403 |

---

## B13. Out of Scope (later)

- Real-time multi-user editing
- Sharing a project with another customer
- Restoring a specific Drive revision from inside the builder (staff can do this in Drive directly for now)

---

# Add to main README (`## Features` section)

```md
- **UV DTF / Sticker cut lines** — an "Add Contour Cut" checkbox above the image list turns
  cut lines on for every image (off = no cuts). Per image, customers choose Circle, Box, or
  Contour with a +/− border control (2 mm default, 0.5 mm steps). No style selected = Box at
  2 mm that hugs the image. Cut paths export as a `CutContour` spot-color layer and drive
  gang-sheet nesting and pricing.
- **Save & reopen projects** — the full project saves as a JSON file to Google Drive and can be
  reopened later to edit or fix.
- **Staff tools** — Fix mode, load a project JSON exactly as it was ordered, export layered
  Photoshop files (art only) with all original uploads, and re-import Photoshop edits.
- Spec: `docs/GANGSHEET_ADDON_SPEC.md`
```
