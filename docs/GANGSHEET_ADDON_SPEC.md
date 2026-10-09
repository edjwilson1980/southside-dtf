# Gang Sheet Builder Add-on — UV DTF Cutout Stickers, Save/Reopen & Staff Tools

**Project:** Southside Gang Sheet Builder (Next.js 15, WooCommerce checkout)
**Where this goes:** `docs/GANGSHEET_ADDON_SPEC.md` — one spec for Cursor covering everything below.
**Release:** **v2.3.0** — shown in the builder's page footer (Part C).
**DTF only:** vinyl stickers have been removed from this project and moved to their own spec, `VINYL_STICKER_MAKER_SPEC.md`.

| Part | What it covers | Applies to |
|---|---|---|
| **A. UV DTF Cutout Stickers** | DTF sticker maker layout, Box 2 Cut / No Cut, fixed 2.5 mm Square Cut, red preview line, registration marks, Start Cut box, removing vinyl | UV DTF only |
| **B. Save & Reopen Projects + Staff Tools** | Save Job / Reopen Job, Google Drive project JSON, staff Fix mode, staff as-is JSON load, Photoshop export/import | Save/Reopen Job: DTF sticker maker only · staff tools: all orders |
| **C. Version Footer & Release Notes** | Version number in the page footer, versioning rules, changelog | Whole builder |
| **D. Top Menu** | Shop Builder · DTF Stickers · Vinyl Stickers · Halftone Generator | Every page |
| **E. Shop Builder Projects & Customer Project Files** | Reopen Project button (Shop Builder), a JSON for every project, customer-site projects saved to Drive for staff | Shop Builder + customer site |

### Summary of decisions
- **Shop Builder:** **Reopen Project** button in the **top-right corner**. **Every project gets a JSON file** in Google Drive (Part E).
- **Customer site:** when a customer's files are created, a **project JSON is written to Google Drive automatically**, so staff can open that project in the Shop Builder (Part E).
- **Top menu** on every page: **Shop Builder · DTF Stickers · Vinyl Stickers · Halftone Generator** (Part D).
- **Automatic project JSON:** as soon as files upload to Google Drive, the job's `project.ssp.json` is created or updated in the same folder automatically (Section B2).
- **This project is DTF only.** Vinyl stickers are a separate project (`VINYL_STICKER_MAKER_SPEC.md`); all vinyl code comes out of this one (Section A14).
- **Top-right corner:** **Reopen Job** and **Export to Photoshop**.
- **Box 1:** Customer Name. **Box 2:** **Cut / No Cut** (No Cut by default). **Save Job** right below Box 2, then **Upload Sticker Art**.
- **Cut = a standard 2.5 mm Square Cut** around every image, hugging the art. Not adjustable, no other shapes.
- **Preview** shows a **solid red rectangle** around every image, plus **registration marks fitted to the printed sheet** and a **Start Cut box**.
- Jobs save as **JSON in Google Drive** and can be **reopened** to edit or fix.
- **Staff** get Fix mode, an **as-is JSON load** (exact layout, cuts and charged price), and a **Photoshop export with all originals** (art only, **no cut lines**) plus re-import.

---

# Part A — UV DTF Cutout Stickers

**Goal:** On the DTF sticker maker, the customer chooses **Cut** or **No Cut** for the job. With Cut on, every image gets a **standard 2.5 mm Square Cut**, shown as a **red trace line** in the preview. The production file carries the cut line, **registration marks fitted to the sheet** and a **Start Cut box** the cutter operator can follow.

**Scope:** **UV DTF only.** There are no circle, contour or adjustable-border options in this project. Vinyl stickers are a separate project with their own spec (`VINYL_STICKER_MAKER_SPEC.md`), and nothing from it belongs here (Section A14).

| Option | What it does |
|---|---|
| **No Cut** (default) | Art only. No cut lines, marks or Start Cut box. |
| **Cut** | Every image gets a **Square Cut 2.5 mm** around it. Not adjustable. |

- A0. DTF Sticker Maker Layout
- A1. Box 2 — Cut / No Cut
- A2. Uploaded Image Rows
- A3. The Square Cut (2.5 mm)
- A4. Preview Box — Red Trace Line, Marks and Start Box
- A5. Production Output — Cut File, Registration Marks & Start Cut Box
- A6. Gang Sheet Nesting & Pricing
- A7. Data Model
- A8. File Structure & Config
- A9. Product Gating
- A10. Acceptance Criteria
- A11. Test Cases
- A12. Saving & Reopening
- A13. Out of Scope
- A14. Removing Vinyl From This Project

---

## A0. DTF Sticker Maker Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [ Shop Builder ] [▌DTF Stickers ] [ Vinyl Stickers ] [ Halftone Generator ]    │  ← top menu (Part D)
├────────────────────────────────────────────────────────────────────────────────┤
│  SOUTH SIDE DTF STICKER MAKER       [ 📂 Reopen Job ]  [ ⬇ Export to Photoshop ] │  ← top-right
├──────────────────────────────────────────┬─────────────────────────────────────┤
│  ①  CUSTOMER NAME  [ ________________ ]  │  PREVIEW                            │
├──────────────────────────────────────────┤  ┌───────────────────────────────┐  │
│  ②  CUT    ( • ) Cut    (   ) No Cut     │  │ ■ ▶ START CUT #48213        ■ │  │
├──────────────────────────────────────────┤  │  ┏━━━━━━━┓  ┏━━━━┓  ┏━━━━━━┓  │  │
│  [ 💾 Save Job ]   Saved ✓               │  │  ┃ LOGO  ┃  ┃ ★  ┃  ┃ TEXT ┃  │  │
├──────────────────────────────────────────┤  │  ┗━━━━━━━┛  ┗━━━━┛  ┗━━━━━━┛  │  │
│  UPLOAD STICKER ART                      │  │ ■                           ■ │  │
│  ┌──────┐ logo-front.png   4.00"×3.20" ✕ │  └───────────────────────────────┘  │
│  │ img  │ Square Cut · 2.5 mm            │  ━━ = RED trace line (the cut)      │
│  └──────┘ Finished 4.20" × 3.40"         │  ■  = registration marks            │
├──────────────────────────────────────────┤                                     │
│  ③ …  (remaining boxes)                  │                                     │
└──────────────────────────────────────────┴─────────────────────────────────────┘
```

- **Top menu:** Shop Builder · DTF Stickers · Vinyl Stickers · Halftone Generator, with **DTF Stickers** highlighted on this page (Part D).
- **Top-right corner:** **Reopen Job** and **Export to Photoshop**, side by side (Sections B1 and B6).
- **Box 1 — Customer Name** (existing).
- **Box 2 — Cut / No Cut** for the whole job.
- **Save Job** right below Box 2.
- **Upload Sticker Art:** each uploaded image shows a fixed **"Square Cut · 2.5 mm"** label when Cut is on. No options per image.
- **Preview box:** a **solid red trace line** around every image, plus registration marks and the Start Cut box.
- The rest of the existing boxes follow, renumbered from ③.
- **No expand / contract control** and **no border control** anywhere.

---

## A1. Box 2 — Cut / No Cut

- **Default: No Cut** (`CUT_DEFAULT_ENABLED=false`).
- **Cut:** every image in the job gets a Square Cut at 2.5 mm, including images uploaded later.
- **No Cut:** the cut function is fully off.
  - No cut labels on image rows.
  - No red lines, marks or Start Cut box in the preview.
  - No cut paths computed.
  - Nesting and price use the bare art footprint.
  - The production PDF has **no `CutContour` layer, no registration marks and no Start Cut box**.
  - No cut meta saved to the order.
- **Switching either way re-nests the sheet and re-signs the price** immediately.

---

## A2. Uploaded Image Rows

```
┌──────────────────────────────────────────────────────┐
│  ┌──────┐  logo-front.png       4.00" × 3.20"    ✕   │
│  │ img  │  Square Cut · 2.5 mm                       │
│  └──────┘  Finished size: 4.20" × 3.40"              │
└──────────────────────────────────────────────────────┘
```

- With **Cut** on: a plain label **"Square Cut · 2.5 mm"** and the finished size (art + 2.5 mm each side).
- With **No Cut**: no cut label; finished size = art size.
- There are **no buttons, choices or −/+ controls** on the row.

---

## A3. The Square Cut (2.5 mm)

- **Shape:** a rectangle (or square) that hugs the image — the tight bounding box of the art plus **2.5 mm on every side**.
- **Never padded out to a perfect square.** A 6" × 2" banner gets a 6.20" × 2.20" rectangle, so no material is wasted.
- **Corners:** square.
- **Bounding box comes from the hardened alpha** (`lib/alpha.ts`, same `ALPHA_THRESHOLD` as the white underbase), so the box hugs what actually prints, not the transparent canvas around it.
- **Fixed size:** `UV_DTF_CUT_OFFSET_MM=2.5`. The customer can't change it. The server **always** applies 2.5 mm and ignores any other value sent from the browser or an old job file.
- **No circle, contour or custom shapes.** No contour tracing code, Clipper, Welzl or smoothing is needed in this project.

---

## A4. Preview Box — Red Trace Line, Marks and Start Box

**Every image in the preview shows a solid red rectangle around it** — the exact line the cutter will follow.

| Property | Value |
|---|---|
| Line color | **Red `#E10600`** |
| Line style | **Solid**, **2 px** on screen at any zoom (`vector-effect: non-scaling-stroke`) |
| Fill between art and line | Light red tint `rgba(225, 6, 0, 0.06)` |
| Layer order | Drawn **on top of** the image |
| Hover / selected image | Line goes to **3 px** and the matching image row highlights |

- The red line appears **as soon as an image finishes uploading** (with Cut on).
- **Registration marks** (black) and the **Start Cut box** are drawn where they'll print (Section A5).
- **No Cut:** art only.
- The preview fits the sheet to the box automatically and scrolls for long sheets. No expand / contract control.
- **Preview only:** red is the on-screen color. The production PDF uses the `CutContour` spot color, because the cutter software detects the line by that name.

### Implementation (so the line actually shows)
Render the cut lines as an **SVG layer absolutely positioned on top of the preview canvas**, in the same inch-based coordinates as the image placements.

```tsx
// components/CutlineOverlay.tsx
interface Placed { id: string; xIn: number; yIn: number; cut?: { wIn: number; hIn: number; dxIn: number; dyIn: number } }

export function CutlineOverlay({ items, sheetWIn, sheetHIn, pxPerIn, selectedId }:
  { items: Placed[]; sheetWIn: number; sheetHIn: number; pxPerIn: number; selectedId?: string }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={sheetWIn * pxPerIn} height={sheetHIn * pxPerIn}
      viewBox={`0 0 ${sheetWIn} ${sheetHIn}`}   // draw in inches
      style={{ zIndex: 20 }}                     // above the art
    >
      {items.filter(i => i.cut).map(i => (
        <rect
          key={i.id}
          x={i.xIn + i.cut!.dxIn} y={i.yIn + i.cut!.dyIn}
          width={i.cut!.wIn} height={i.cut!.hIn}
          fill="rgba(225,6,0,0.06)"
          stroke="#E10600"
          strokeWidth={i.id === selectedId ? 3 : 2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
```

- Mount it **inside the same relatively positioned wrapper** as the preview canvas: `<div className="relative">…canvas…<CutlineOverlay/></div>`.
- `cut` comes from `buildSquareCut()` (Section A7): the rectangle's size and its offset from the image's top-left, already including the 2.5 mm.

---

## A5. Production Output — Cut File, Registration Marks & Start Cut Box

### Cut file
- **Spot color name:** `CutContour` (Roland VersaWorks / Mimaki / Summa / Graphtec convention), configurable as `CUT_SPOT_NAME`.
- **Stroke:** 0.25 pt, 100% magenta (`C0 M100 Y0 K0`), no fill.
- **Production PDF:** art on one layer, `CutContour` rectangles on their own layer as a **Separation** color space. Also export an SVG of the cut paths for debugging.
- **The server is the source of truth.** Client preview and server use the **same `lib/cutline` code**; the server recomputes all cut rectangles at add-to-cart.

### Registration marks — fit to the page
Registration marks are placed to fit **the actual printed sheet**, not the full roll.

```
 ◀─────────────── 22" sheet width ───────────────▶
┌─────────────────────────────────────────────────┐ ▲
│ ■ ▶ START CUT #48213 · Ed · 10/08 · 1 of 1     ■ │ │ top mark zone
│                                                 │ │
│    ┌ ─ ─ ┐   ╭ ─ ─ ╮   ┌ ─ ─ ─ ─ ┐               │ │
│    ¦     ¦   ¦     ¦   ¦         ¦               │ │ art area
│    └ ─ ─ ┘   ╰ ─ ─ ╯   └ ─ ─ ─ ─ ┘               │ │
│ ■                                              ■ │ │ side pair (long sheets)
│    ┌ ─ ─ ─ ┐  ┌ ─ ─ ┐                            │ │
│    └ ─ ─ ─ ┘  └ ─ ─ ┘                            │ │
│ ■                                              ■ │ │ bottom mark zone
└─────────────────────────────────────────────────┘ ▼
   sheet length = art length + top and bottom mark zones
```

- **Mark style:** solid black squares, **5 mm** (`REG_MARK_SIZE_MM`). Style configurable for the shop's cutter: `REG_MARK_STYLE=square|crop`.
- **Corner marks:** one in each of the 4 corners of the printed sheet, inset **10 mm** from the sheet edges (`REG_MARK_INSET_MM`).
- **Fit to length:** the sheet length is the art length plus the top and bottom mark zones, so marks always sit at the real ends of the job, not at a fixed roll length.
- **Long sheets:** add a pair of side marks at most every **500 mm** (`REG_MARK_SPACING_MM`) down both edges, spaced evenly between the corner marks so the cutter can correct for skew.
- **Fit to width:** marks use the printable width of the 22" roll minus the printer's side margins (`PRINT_SIDE_MARGIN_MM`), so they're never clipped.
- **Keep-out zone:** nesting reserves a **5 mm** clear zone around every mark and around the Start Cut box (`REG_MARK_CLEARANCE_MM`). No art or cut line can land inside it.
- **Short jobs:** still get all 4 corner marks; the sheet is padded to the minimum length the cutter can read (`REG_MIN_SHEET_LENGTH_MM`).
- **No Cut jobs** get no marks at all.
- Check the exact mark size, inset and spacing against the cutter's manual on the first test sheet; every value above is a config setting.

### Start Cut box
A small printed box tells the operator **where to start the cut** and which way the sheet feeds.

```
┌──────────────────────────────────────────────────────┐
│ ▶ START CUT    Order #48213 · Ed · 10/08/26           │
│   ↓ Feed this edge first    Sheet 1 of 1 · 14 cuts    │
└──────────────────────────────────────────────────────┘
```

- **Position:** next to the **first registration mark** at the cutter's origin corner, inside the top mark zone. The corner is configurable to match the cutter: `CUT_START_CORNER=top-left|top-right|bottom-left|bottom-right` (default `top-left`).
- **Size:** about **40 × 12 mm**, black outline and text, printed on the **art layer only** (never on the `CutContour` layer, so the blade ignores it).
- **Contents:** "▶ START CUT", order number, customer name (from Box 1), date, sheet number (e.g. 1 of 2), number of cuts on the sheet, and a **feed-direction arrow**.
- Shown in the preview box in the same place it will print.
- Multi-sheet jobs get a Start Cut box on **every** sheet with its own sheet number.


---

## A6. Gang Sheet Nesting & Pricing

- **MaxRects nesting uses the cut rectangle** (art + 2.5 mm each side), not the bare art, when Cut is on.
- **Gap between pieces:** minimum **1/8"** between cut lines (`CUT_MIN_GAP_IN`), so the blade doesn't cut neighbors.
- **Registration marks and the Start Cut box** have reserved keep-out zones (Section A5); nesting never places art inside them, and the sheet length includes the top and bottom mark zones.
- **Price** = sheet length after nesting → still **HMAC-signed server-side**. The Cut / No Cut choice is part of the signed payload.

---

## A7. Data Model

```ts
// types/cutline.ts
export const UV_DTF_CUT_OFFSET_MM = 2.5; // fixed

// Box 2: Cut / No Cut for the whole job
export interface SheetCutState {
  enabled: boolean; // false = No Cut (cut function fully off)
}

// Result of buildSquareCut(alphaMask, dpi) for one image, in inches
export interface SquareCut {
  dxIn: number; dyIn: number; // rectangle's top-left relative to the image's top-left (can be negative)
  wIn: number;  hIn: number;  // art bounding box + 2 × 2.5 mm
}
```

- `buildSquareCut()` finds the bounding box of the hardened alpha and grows it by 2.5 mm on each side. That's the whole cut algorithm.

### WooCommerce line-item meta
| Meta key | Example |
|---|---|
| `_ssp_cut_enabled` | `yes` / `no` |
| Visible to customer | `Cut: Square Cut 2.5 mm` or `Cut: No` |

`enabled` is part of the **HMAC-signed payload**, so switching Cut / No Cut needs a fresh price signature.

---

## A8. File Structure & Config

```
lib/cutline/
  squareCut.ts    // buildSquareCut(): alpha bounding box + 2.5 mm
  marks.ts        // registration mark layout (fit to sheet, spacing, keep-out zones)
  startBox.ts     // Start Cut box content + placement
  export.ts       // PDF CutContour separation layer + debug SVG
  constants.ts    // UV_DTF_CUT_OFFSET_MM, spot name, gap, mark settings
components/
  CutOptionsBox.tsx     // Box 2: Cut / No Cut, under Customer Name
  ImageCutLabel.tsx     // "Square Cut · 2.5 mm" + finished size on each image row
  JobBar.tsx            // Save Job, right below Box 2
  TopRightActions.tsx   // Reopen Job + Export to Photoshop, top-right corner
  CutlineOverlay.tsx    // SVG layer over the preview: solid red rectangle around every image
  SheetMarksOverlay.tsx // registration marks + Start Cut box in the preview
app/api/cutline/route.ts // server recompute for cart + production
scripts/
  test-cutline.ts
```

### Config (`.env`)
```
CUT_DEFAULT_ENABLED=false
CUT_SPOT_NAME=CutContour
UV_DTF_CUT_OFFSET_MM=2.5
CUT_MIN_GAP_IN=0.125
REG_MARK_STYLE=square
REG_MARK_SIZE_MM=5
REG_MARK_INSET_MM=10
REG_MARK_SPACING_MM=500
REG_MARK_CLEARANCE_MM=5
REG_MIN_SHEET_LENGTH_MM=150
PRINT_SIDE_MARGIN_MM=5
CUT_START_CORNER=top-left
```

### Dependencies
```
npm i pdf-lib
```
(No Clipper or geometry libraries needed — the cut is a rectangle.)

---

## A9. Product Gating

- Show Box 2 (Cut / No Cut), Save Job, Reopen Job and Export to Photoshop only when the WooCommerce attribute `pa_print_type` = **`uv-dtf`**.
- Standard DTF transfer pages don't show any of this; they nest exactly as they do today.
- `vinyl-sticker` is **not** a product type in this project. If an order or job file arrives with it, reject it with *"Vinyl stickers are handled in the Vinyl Sticker Maker."*

---

## A10. Acceptance Criteria

- [ ] **Reopen Job** and **Export to Photoshop** sit in the top-right corner of the DTF sticker maker.
- [ ] Box 2 (Cut / No Cut) sits right under Box 1 (Customer Name); **No Cut** is the default.
- [ ] **Save Job** sits right below Box 2.
- [ ] With Cut on, every image row shows **"Square Cut · 2.5 mm"** and its finished size; there are no cut choices, border controls or expand / contract controls anywhere.
- [ ] The Square Cut hugs the art's printed area (from the hardened alpha) plus exactly 2.5 mm on each side, never padded to a perfect square.
- [ ] The preview shows a **solid red rectangle (#E10600, 2 px)** around every image as soon as it uploads, drawn on top of the art, plus registration marks and the Start Cut box.
- [ ] No Cut: no labels, red lines, marks, Start Cut box or `CutContour` layer; price and nesting use bare art.
- [ ] The server always uses 2.5 mm, whatever the browser or job file says.
- [ ] Registration marks sit in all 4 corners of the **printed sheet** (10 mm inset), with side pairs at most every 500 mm on long sheets, and never overlap art or cut lines.
- [ ] The Start Cut box prints at the configured origin corner next to the first mark, on the art layer only, with order #, customer name, date, sheet x of y, cut count and a feed arrow.
- [ ] Nesting uses cut rectangles with a 1/8" minimum gap and respects mark keep-out zones.
- [ ] Price changes when Cut / No Cut changes, and stays HMAC-signed.
- [ ] The production PDF opens in the shop's cutter RIP with `CutContour` auto-detected and the marks read correctly.
- [ ] No vinyl code, product type, components or settings remain in the project (Section A14).

---

## A11. Test Cases (`scripts/test-cutline.ts`)

| Input | Expected |
|---|---|
| Cut on, upload 1 image | Row shows "Square Cut · 2.5 mm"; red rectangle around it in the preview |
| Cut on, upload 3 images | All three get red rectangles 2.5 mm outside the art |
| 4" × 3.2" logo | Finished size 4.20" × 3.40" (2.5 mm ≈ 0.098" per side, rounded for display) |
| Wide 6" × 2" banner | Cut is a ~6.20" × 2.20" rectangle, not a square |
| Logo PNG with lots of transparent padding | Rectangle hugs the visible art, not the canvas |
| Cut → No Cut → Cut | No red lines/marks while No Cut; they return when Cut is back on |
| Job file with `offsetMm: 4` | Server uses 2.5 mm |
| Job file with `printType: vinyl-sticker` | Rejected with the Vinyl Sticker Maker message |
| Zoom / scroll the preview | Red lines stay 2 px and aligned with the art |
| 30" sheet | 4 corner marks inset 10 mm, no side pairs, Start Cut box top-left |
| 1,500 mm sheet | 4 corner marks + side pairs at most every 500 mm |
| Tiny job (one 1" sticker) | Sheet padded to minimum length; 4 marks still present |
| Art placed near a corner | Nesting keeps it 5 mm clear of the mark and the Start Cut box |
| 2-sheet job | Each sheet has its own marks and Start Cut box ("1 of 2", "2 of 2") |
| `CUT_START_CORNER=bottom-right` | Start Cut box moves next to the bottom-right mark |

---

## A12. Saving & Reopening

The Cut / No Cut choice is stored in the job JSON file. Reopening a job restores it; cut rectangles and price are recomputed. The one exception is the staff **as-is** load (Section B5.2), which uses the exact cut lines and price from the order snapshot. See Part B.

---

## A13. Out of Scope

- Circle cuts, contour cuts and adjustable borders (these belong to the separate Vinyl Sticker Maker)
- Kiss-cut vs. through-cut selection per piece
- Custom drawn cut paths
- True-shape polygon nesting

---

## A14. Removing Vinyl From This Project

Vinyl stickers now live in their own project (`VINYL_STICKER_MAKER_SPEC.md`). Remove every trace of them from this codebase so the two logics can't mix.

**Delete**
- `vinyl-sticker` from every product-type list, enum, switch and WooCommerce attribute check.
- Circle and contour cut code: contour tracing (marching squares), Clipper offsetting, Welzl circle, Chaikin/RDP smoothing, and their tests.
- The per-image cut choice buttons (Square / Circle / Contour) and the per-image border −/+ control.
- Any global border or expand / contract control.
- `CUT_RULES`, `ALLOWED_SHAPES`, `DEFAULT_CUT` per-product maps, `CutShape`, `CutSettings.shape`, `CutSettings.offsetMm`, `perImage` cut settings, `TIGHT_BORDER` / `MULTIPLE_PIECES` warnings.
- `.env` keys: `CUT_DEFAULT_SHAPE`, `CUT_DEFAULT_OFFSET_MM`, `CUT_STEP_MM`, `CUT_MIN_OFFSET_MM`, `CUT_MIN_OFFSET_MM_BOX`, `CUT_MAX_OFFSET_MM`.
- The `clipper2-js` package (`npm uninstall clipper2-js`).
- "Add Contour Cut" wording anywhere in the UI.

**Keep**
- Square Cut at 2.5 mm, Cut / No Cut, the red preview rectangle, registration marks, Start Cut box, `CutContour` production layer, Save / Reopen Job, staff tools and the version footer.

**Old job files:** project JSON with per-image `shape` / `offsetMm` values still opens; those fields are ignored and every image gets the 2.5 mm Square Cut. A schema migration (`schemaVersion` 1 → 2) strips them on the next save.

**Check when done:** search the codebase for `vinyl`, `contour` (excluding `CutContour`), `circle`, `clipper`, `offsetMm` and `ALLOWED_SHAPES` — there should be no matches outside this spec and the migration.

---

# Part B — Save & Reopen Projects + Staff Tools

**Goal:** Save the full gang-sheet project as a **JSON file in Google Drive**, with **Save Job** and **Reopen Job** buttons on the DTF sticker maker, so the customer or shop staff can open it later to edit or fix it.

**Scope:**
- **Project JSON in Google Drive:** **every project** — DTF Stickers, Shop Builder and the customer site (Part E).
- **Save Job / Reopen Job buttons:** the DTF sticker maker. The Shop Builder has its own **Reopen Project** button (Part E). The customer site has no buttons; its JSON is written automatically.
- **Order snapshots and staff tools** (Fix mode, as-is load, Photoshop export/import): every order, so staff can fix any job.

- B1. What the Customer Sees — Save Job / Reopen Job (DTF sticker maker only)
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

## B1. What the Customer Sees — Save Job / Reopen Job (DTF sticker maker only)

These appear **only on the DTF sticker maker**; standard DTF gang sheet pages don't show them.

- **Reopen Job** sits in the **top-right corner** of the page, next to **Export to Photoshop** (Section B6).
- **Save Job** sits **right below Box 2 (Cut / No Cut)**, above "Upload Sticker Art" (Section A0).

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SOUTH SIDE DTF STICKER MAKER [ 📂 Reopen Job ]  [ ⬇ Export to Photoshop ] │
├──────────────────────────────────────────────────────────────────────────┤
│  ①  CUSTOMER NAME   [ Ed's Fire Dept order ____________ ]                 │
├──────────────────────────────────────────────────────────────────────────┤
│  ②  CUT   ( • ) Cut   (   ) No Cut                                        │
├──────────────────────────────────────────────────────────────────────────┤
│  [ 💾 Save Job ]   Saved 2:41 PM ✓                                        │
│       └ Download job file                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│  UPLOAD STICKER ART                                                       │
```

- **Save Job:** saves the job to Google Drive and shows "Saved 2:41 PM ✓". The first save also shows a reopen link the customer can copy or bookmark. The job is named from Box 1 (customer name) plus the date unless renamed.
- **Download job file:** a small link under Save Job that downloads the same `.ssp.json`.
- **Reopen Job** (top right): opens a dialog with three options:
  1. **My recent jobs** — jobs tied to the logged-in WooCommerce account.
  2. **Upload job file** — a `.ssp.json` file downloaded earlier.
  3. **Paste reopen link** — `southsidedtf.com/builder?project=<id>&t=<token>`
- Autosave to Drive runs in the background on the DTF sticker maker (Section B2); the status text next to Save Job shows it.

```
┌─────────────────────────────────────────────┐
│  REOPEN JOB                             ✕   │
│                                             │
│  Recent                                     │
│   • Crash Out Club drop 3   Oct 8, 2:41 PM  │
│   • Fire Dept stickers      Oct 2, 9:15 AM  │
│                                             │
│  [ Upload .ssp.json job file ]              │
│  [ Paste reopen link ___________________ ]  │
└─────────────────────────────────────────────┘
```

- In code and in this spec, "project" and "job" mean the same thing; customers only ever see **"Job."**

---

## B2. When a Project Is Saved

| Trigger | What happens |
|---|---|
| **Files uploaded to Google Drive** (automatic) | **First upload:** create the job folder and `project.ssp.json` right away. **Every upload after:** update `project.ssp.json` with the new image(s). No Save click needed. |
| **Save Job** button (DTF sticker maker) | Save now, new Drive revision |
| **Autosave** (DTF sticker maker) | Every 60 s while there are unsaved changes, plus on page hide/close (`visibilitychange`) |
| **Add to cart** | Save, and lock that version to the cart item |
| **Order placed** (WooCommerce webhook / n8n) | Copy the locked version into the order folder as `order-<orderId>.ssp.json` |

### Automatic project JSON on upload
Every uploaded file gets a project JSON next to it in Drive automatically, so the files and the job record are never separated.

1. Customer uploads an image (or several).
2. The server stores the original in `originals/` and the processed version in `processed/` in the job's Drive folder (Section B3).
3. **In the same request, after the image upload succeeds**, the server writes `project.ssp.json` in that folder:
   - **First upload of a new job:** create the folder and the JSON (job name from Box 1 + date; "Untitled job" + date if Box 1 is empty).
   - **Later uploads:** add the new image entries (Drive file IDs, SHA-256, size, cut choice) to the existing JSON.
   - **Image removed (✕):** remove its entry from the JSON; the image files are kept in Drive for 30 days, then deleted.
4. The JSON is signed (`sig`, Section B4) and the status next to Save Job shows "Saved ✓".

- **Never an image without its JSON.** If the image uploads but the JSON write fails, retry up to 3 times. If it still fails, mark the job "Not saved — retrying" and retry on the next change or autosave.
- **Batch uploads** (e.g. 10 images at once) write the JSON once after the batch, not 10 times.
- **Every JSON write records `lastUploadAt`** and the list of files, so staff can see exactly which files belong to the job.
- This applies to every upload on the DTF sticker maker, and to staff re-imports (PSD import updates the JSON the same way).

- Autosave is quiet: the status reads "Saving…" then "Saved ✓".
- If a save fails (offline, Drive down), keep the project in `localStorage` as a backup and retry with backoff. Show "Not saved — retrying" in red.

---

## B3. Google Drive Layout

```
Gang Sheet Projects/                      ← GDRIVE_ROOT_FOLDER_ID
  2026-10/
    prj_8f3k2a/                          ← one folder per project
      project.ssp.json                   ← created on first upload, updated on every upload/save
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
  "schemaVersion": 2,
  "projectId": "prj_8f3k2a",
  "name": "Crash Out Club drop 3",
  "createdAt": "2026-10-08T19:41:00Z",
  "updatedAt": "2026-10-08T19:55:12Z",
  "lastUploadAt": "2026-10-08T19:54:40Z",
  "source": "customer-site",
  "revision": 7,
  "owner": { "wcCustomerId": 1182 },
  "customer": { "name": "Crash Out Club", "email": "orders@example.com", "phone": null },
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
      "cut": { "squareCutMm": 2.5 }
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
  "codeVersion": { "builder": "2.3.0", "cutline": "1.1.0", "alpha": "1.0.3" },
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
- **`schemaVersion`:** `lib/project/migrate.ts` upgrades old files step by step (v1 → v2 → …) so old projects always open. **v1 → v2** drops the old per-image `shape` / `offsetMm` cut fields (from the removed vinyl options); every image gets the fixed 2.5 mm Square Cut.

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

**Where:** the **Export to Photoshop** button in the **top-right corner** of the DTF sticker maker, next to Reopen Job (Section A0). It's also in the staff bar in Fix mode and on any staff-opened project.

**Who sees it:** staff (WP `manage_woocommerce`) by default. Set `PSD_EXPORT_VISIBLE_TO=everyone` to show it to all DTF sticker maker users. It gives a fully layered Photoshop file plus every original upload, so advanced edits happen in Photoshop instead of the builder.

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
5. Put the new art back in its slot and **draw the cut line from the new art**, using that image's cut shape and border (and only if Box 2 is set to Cut). Other images don't move.
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
| Staff (WP `manage_woocommerce`) | Any project from any source (Shop Builder, customer site, DTF Stickers) via **Reopen Project**, including Fix mode, as-is JSON load, PSD export and PSD import |

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
PSD_EXPORT_VISIBLE_TO=staff          # staff | everyone
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
  ReopenDialog.tsx      // "Reopen Job" dialog (opened from the top-right button): recent jobs, file upload, paste link
  (buttons live in JobBar.tsx — see Part A file structure)
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

- [ ] **The first file upload** automatically creates the Drive job folder and `project.ssp.json`; every later upload updates it, with no Save click.
- [ ] An image is never left in Drive without a matching entry in `project.ssp.json` (retry on failure, "Not saved — retrying" shown).
- [ ] A batch upload writes the JSON once after the batch.
- [ ] **Save Job** creates a Drive project folder with `project.ssp.json`, `originals/` and `processed/`.
- [ ] Autosave runs every 60 s when there are changes and on page close; the status shows Saving… / Saved ✓ / Not saved.
- [ ] **Download job file** gives the same JSON, with a valid `sig`.
- [ ] **Reopen Job** works from the recent list, an uploaded file, and a pasted link.
- [ ] Reopen Job and Export to Photoshop sit in the top-right corner; Save Job sits right below Box 2; none of them show on standard DTF pages.
- [ ] Orders from every product still get a frozen snapshot, so staff tools work on any order.
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
| Upload 1 image to a new job, don't click Save | Drive has the job folder, the image and `project.ssp.json` listing it |
| Upload 2 more images | `project.ssp.json` now lists all 3; `lastUploadAt` updated |
| Remove image 2 (✕) | Its entry leaves the JSON; files kept 30 days |
| Drive JSON write fails once | Retried; status recovers to "Saved ✓" |
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

# Part C — Version Footer & Release Notes

**Goal:** Every page of the builder shows the current version number in a footer at the bottom of the screen, so staff and customers can tell which version they're on when reporting a problem.

## C1. This Release

**Version: `2.3.0`** — everything in Parts A, B, D and E ships together as this release. 2.3.0 adds the Shop Builder's **Reopen Project** button and a project JSON for every project, including customer-site projects (Part E). 2.2.0 added the top menu and automatic JSON on upload; 2.1.0 removed vinyl. Set the footer and `package.json` to 2.3.0.

## C2. The Footer

```
┌──────────────────────────────────────────────────────────────────────┐
│  ... builder ...                                                     │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  South Side DTF Gang Sheet Builder  ·  v2.3.0  ·  What's new         │  ← customer
└──────────────────────────────────────────────────────────────────────┘

├──────────────────────────────────────────────────────────────────────┤
│  South Side DTF Gang Sheet Builder  ·  v2.3.0  ·  build 3f9c2a1  ·    │  ← staff
│  2026-10-08 14:02 CT  ·  cutline 1.1.0  ·  alpha 1.0.3  ·  What's new │
└──────────────────────────────────────────────────────────────────────┘
```

- **Placement:** a slim footer bar pinned to the bottom of every builder page (full width, small grey text, ~32 px tall). It sits below the builder content and never covers the canvas or the Add-to-cart button. On phones it wraps to two lines.
- **Customers see:** app name, version, and a **What's new** link.
- **Staff see** (WP `manage_woocommerce`): also the git commit (short hash), build date/time in Chicago time, and the `cutline` and `alpha` module versions — the same values written into a project's `snapshot.codeVersion`.
- **Click the version** to copy `v2.3.0 (3f9c2a1)` to the clipboard, with a "Copied" toast, so it can be pasted into a bug report.
- **What's new** opens a small modal showing the `CHANGELOG.md` entry for the current version.
- Also shown in the footer of the **staff PSD export `README.txt`** and in the production PDF metadata (`Producer: SSP Gang Sheet Builder v2.3.0`).

## C3. Where the Number Comes From

- **One source of truth:** `"version"` in `package.json`. Set it to `"2.3.0"` for this release.
- `next.config.ts` exposes it at build time, with no hard-coding in components:

```ts
// next.config.ts
import pkg from './package.json';
import { execSync } from 'node:child_process';

const commit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
})();

export default {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_COMMIT: commit,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};
```

- `lib/version.ts` exports `APP_VERSION`, `BUILD_COMMIT`, `BUILD_TIME`, `CUTLINE_VERSION`, `ALPHA_VERSION`. The footer, project snapshots, PSD `README.txt` and PDF metadata all read from here.
- `GET /api/version` returns the same values as JSON so n8n or monitoring can check what's deployed.

## C4. Versioning Rules (going forward)

| Change | Bump | Example |
|---|---|---|
| Bug fix, no behavior change | Patch | 2.3.0 → 2.3.1 |
| New feature, old projects still open the same | Minor | 2.3.1 → 2.4.0 |
| Changes saved-file format, pricing, or cut output | Major | 2.4.0 → 3.0.0 |

- Every release adds an entry to `CHANGELOG.md` and tags git as `v2.3.0`.
- If a release changes `.ssp.json`, also bump `schemaVersion` and add a migration (Section B4).

## C5. `CHANGELOG.md` entry

```md
## [2.3.0] — 2026-10-09

### Added
- Shop Builder: **Reopen Project** button in the top-right corner, opening any project (shop, customer site or DTF Stickers).
- Every project gets a `project.ssp.json` in Google Drive the moment it's created, updated on every change.
- Customer site: when a customer's files are created, a project JSON is written to Google Drive automatically so staff can open it in the Shop Builder.
- Project JSON records `source`, `customer` and `revision`; edit conflicts are caught.

## [2.2.0] — 2026-10-09

### Added
- Top menu on every page: Shop Builder · DTF Stickers · Vinyl Stickers · Halftone Generator.
- Automatic project JSON: the moment files upload to Google Drive, `project.ssp.json` is created (first upload) or updated (every upload after) in the same job folder, with no Save click needed.

## [2.1.0] — 2026-10-09

### Added
- DTF sticker maker layout: Reopen Job + Export to Photoshop top right; Box 2 "Cut / No Cut" under Customer Name (No Cut by default); Save Job below Box 2.
- UV DTF Cut = standard 2.5 mm Square Cut around every image, hugging the art.
- Preview shows a solid red rectangle around every image, the registration marks and the Start Cut box.
- Registration marks fitted to the printed sheet (4 corners + side pairs on long sheets, keep-out zones).
- Start Cut box at the cutter's origin with order #, customer, date, sheet x of y, cut count and feed arrow.
- CutContour spot-color layer in production PDFs; nesting and pricing use cut rectangles.
- Jobs save as JSON to Google Drive with autosave; Reopen Job reopens them.
- Staff Fix mode, staff "Load project JSON (as-is)" with exact layout/cuts/charged price.
- Photoshop export (per-image or full sheet, art only, with all original uploads) and PSD re-import.
- Version number in the page footer.

### Removed
- Vinyl stickers (moved to the separate Vinyl Sticker Maker project).
- Circle and contour cuts, per-image cut choices and border controls.
- The expand / contract (global border) control.

### Changed
- Gang-sheet price now reflects cut rectangles and mark zones when Cut is on.
- Project JSON `schemaVersion` 2 (old per-image cut fields dropped).
```

## C6. Files

```
lib/version.ts
components/AppFooter.tsx        // footer bar (customer vs staff detail)
components/WhatsNewModal.tsx    // renders the current CHANGELOG entry
app/api/version/route.ts
CHANGELOG.md
```

## C7. Acceptance Criteria

- [ ] Every builder page shows the footer with **v2.3.0** at the bottom of the screen.
- [ ] Customers see name + version + What's new; staff also see commit, build time (CT) and module versions.
- [ ] The version comes only from `package.json`; changing it there and rebuilding updates the footer.
- [ ] Clicking the version copies it; What's new shows the 2.3.0 changelog entry.
- [ ] `snapshot.codeVersion.builder`, the PSD `README.txt` and PDF metadata all show the same version as the footer.
- [ ] `GET /api/version` returns the version, commit and build time.
- [ ] The footer never covers the canvas or Add-to-cart, on desktop or phone.

---

# Part D — Top Menu

**Goal:** One menu bar at the very top of every page so staff and customers can switch between the shop's tools.

## D1. The Menu

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [ Shop Builder ]  [▌DTF Stickers ]  [ Vinyl Stickers ]  [ Halftone Generator ] │
└──────────────────────────────────────────────────────────────────────────────┘
          ▲ active page is filled red with white text; the others are outlined
```

| Button (left → right) | Opens | Where it lives |
|---|---|---|
| **Shop Builder** | The shop's DTF gang sheet builder, with **Reopen Project** top right (Part E) | This app (`/builder`) |
| **DTF Stickers** | The UV DTF sticker maker (Part A) | This app (`/stickers`) |
| **Vinyl Stickers** | The Vinyl Sticker Maker | **Separate project** (`VINYL_STICKER_MAKER_SPEC.md`) — external link |
| **Halftone Generator** | The halftone / color separation tool | **Separate project** — external link |

- **Position:** a full-width bar pinned to the very top of the page, above the page title row (and above Reopen Job / Export to Photoshop).
- **Style:** South Side brand colors. The active page's button is **filled red with white text**; the others are outlined in blue. Same height and font on every page.
- **Order is fixed** as listed above.
- **Phones:** the bar scrolls sideways if the buttons don't fit; the buttons never stack or shrink into a hamburger menu.
- **Separate projects stay separate.** Vinyl Stickers and Halftone Generator are plain links to their own apps. No code is shared or imported; each app copies the same `TopMenu` component and points it at the same URLs.
- **Not live yet:** if a menu item's URL isn't set, the button shows greyed out with a "Coming soon" tooltip instead of a broken link.
- **Unsaved work:** before leaving the page, run the autosave (Section B2). If it can't save, ask *"You have unsaved changes — leave anyway?"*.
- The labels come from one config list, so they can be renamed without touching components.

## D2. Config

```ts
// lib/nav.ts
export const TOP_MENU = [
  { key: 'shop-builder', label: 'Shop Builder',       href: process.env.NEXT_PUBLIC_NAV_SHOP_BUILDER_URL ?? '/builder' },
  { key: 'dtf-stickers', label: 'DTF Stickers',       href: process.env.NEXT_PUBLIC_NAV_DTF_STICKERS_URL ?? '/stickers' },
  { key: 'vinyl',        label: 'Vinyl Stickers',     href: process.env.NEXT_PUBLIC_NAV_VINYL_URL },       // external
  { key: 'halftone',     label: 'Halftone Generator', href: process.env.NEXT_PUBLIC_NAV_HALFTONE_URL },    // external
] as const;
```

```
NEXT_PUBLIC_NAV_SHOP_BUILDER_URL=/builder
NEXT_PUBLIC_NAV_DTF_STICKERS_URL=/stickers
NEXT_PUBLIC_NAV_VINYL_URL=           # set when the Vinyl Sticker Maker is live
NEXT_PUBLIC_NAV_HALFTONE_URL=        # set when the Halftone Generator is live
```

## D3. Files

```
lib/nav.ts
components/TopMenu.tsx      // the bar; highlights the active item by key or current path
app/layout.tsx              // renders <TopMenu /> above every page
```

## D4. Acceptance Criteria

- [ ] Every page shows the top menu: **Shop Builder · DTF Stickers · Vinyl Stickers · Halftone Generator**, in that order.
- [ ] The current page's button is highlighted (red fill, white text).
- [ ] Shop Builder and DTF Stickers open pages in this app; Vinyl Stickers and Halftone Generator open their own apps.
- [ ] A menu item with no URL set is greyed out with "Coming soon", never a broken link.
- [ ] Leaving a page with unsaved work autosaves first, or asks before leaving.
- [ ] On a phone, the bar scrolls sideways and stays on one row.

---

# Part E — Shop Builder Projects & Customer Project Files

**Goal:** Every project — whether staff build it in the Shop Builder or a customer builds it on the website — has a **JSON file in Google Drive**, and staff can open any of them from a **Reopen Project** button in the Shop Builder.

```
  CUSTOMER SITE                         GOOGLE DRIVE                         SHOP BUILDER (staff)
  ─────────────                         ────────────                         ────────────────────
  customer uploads art      ──────▶     prj_8f3k2a/                ◀──────   [ 📂 Reopen Project ]
  files are created                       project.ssp.json  (auto)             → search → open
  (no buttons shown)                      originals/  processed/               → edit / fix / print
```

- E1. Shop Builder — Reopen Project Button
- E2. A JSON File for Every Project
- E3. Customer Site — Automatic Project JSON
- E4. Staff Opening a Customer Project
- E5. Finding Projects (Drive search)
- E6. Files & API
- E7. Acceptance Criteria
- E8. Test Cases

---

## E1. Shop Builder — Reopen Project Button

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [▌Shop Builder ] [ DTF Stickers ] [ Vinyl Stickers ] [ Halftone Generator ]    │  ← top menu
├────────────────────────────────────────────────────────────────────────────────┤
│  SOUTH SIDE SHOP BUILDER                             [ 📂 Reopen Project ]     │  ← top-right corner
├────────────────────────────────────────────────────────────────────────────────┤
│  … existing gang sheet builder …                                               │
```

- **Reopen Project** sits in the **top-right corner** of the Shop Builder, on the same row as the page title, just under the top menu.
- **Staff only.** The Shop Builder is a shop tool; customers never see it.
- Clicking it opens the **Reopen Project** dialog:

```
┌──────────────────────────────────────────────────────────────────────┐
│  REOPEN PROJECT                                                 ✕    │
│                                                                      │
│  Search  [ customer name, order #, email or project ID ________ ]   │
│  Source  ( • ) All   ( ) Shop Builder   ( ) Customer site   ( ) DTF Stickers │
│                                                                      │
│  Recent                                                              │
│   Crash Out Club drop 3   Customer site   Order #48213   Oct 8 2:41 PM │
│   Fire Dept stickers      DTF Stickers    —              Oct 8 1:10 PM │
│   Walk-in: Tony's Tees    Shop Builder    —              Oct 7 4:55 PM │
│                                                                      │
│  [ Upload .ssp.json file ]    [ Paste project link / ID ________ ]   │
└──────────────────────────────────────────────────────────────────────┘
```

- **Search** by customer name, order number, email or project ID. **Source** filter: All / Shop Builder / Customer site / DTF Stickers.
- **Recent** shows the last 25 projects across all sources, newest first, with source, order number (if ordered) and last-updated time.
- **Upload .ssp.json** and **Paste project link / ID** also work.
- Opening a project loads it into the Shop Builder (Section E4). DTF Stickers projects open in the DTF sticker maker instead, so the cut settings stay intact.

---

## E2. A JSON File for Every Project

**Every project gets a `project.ssp.json` in Google Drive — no exceptions, no Save click needed.**

| Where the project starts | When the JSON is created | When it's updated |
|---|---|---|
| **Shop Builder** (staff) | The moment the project is created: **New Project** clicked or first file uploaded | Every upload, edit, autosave (60 s) and save |
| **Customer site** | The moment the customer's files are created (Section E3) | Every upload, edit, add-to-cart and order |
| **DTF Stickers** | First upload (Section B2) | Every upload, edit and Save Job |

- Same folder layout (Section B3) and same file format (Section B4) for all three.
- `source` records where the project started: `"shop-builder"`, `"customer-site"` or `"dtf-stickers"`. It never changes, even when staff edit a customer project.
- `customer` holds name, email and phone when known (from Box 1, the WooCommerce account or the checkout).
- `revision` goes up by 1 on every write (used for conflict checks, Section E4).
- The JSON is signed (`sig`) as in Section B4.

---

## E3. Customer Site — Automatic Project JSON

On the customer-facing gang sheet builder (southsidedtf.com), **customers don't see any save or reopen buttons.** The JSON is written behind the scenes:

1. Customer uploads artwork.
2. The server processes it (background removal, alpha fix, upscale) and **creates the files** in the project's Drive folder (`originals/`, `processed/`).
3. **As soon as the files are created**, the server writes `project.ssp.json` in the same folder with `source: "customer-site"`.
4. Every change after that (more uploads, resizing, quantities, removing an image) updates the JSON, batched to at most one write every 10 seconds.
5. **Add to cart** saves and locks that revision to the cart item (Section B2). **Order placed** freezes `order-<orderId>.ssp.json` with a snapshot (Section B4).

- **Guests too.** Customers who aren't logged in still get a project JSON; `customer` fills in at checkout. Abandoned guest projects with no order are deleted after `CUSTOMER_PROJECT_RETENTION_DAYS` (default 90).
- **Never a file without its JSON.** If the JSON write fails, retry up to 3 times, then keep retrying on the next change. Log failures for staff.
- **No slowdown for the customer.** The JSON write runs after the upload response returns; the customer never waits on it.

---

## E4. Staff Opening a Customer Project

When staff open a customer-site project from **Reopen Project**:

| Project state | What staff get |
|---|---|
| **Not ordered yet** | Opens the live project. Staff can edit it; changes save to the same JSON (`revision` + 1). The customer sees the changes next time they load the page. |
| **In a cart** | Opens read-only with a banner: *"This project is in the customer's cart. Edit a copy?"* → **Edit a copy** makes a new Shop Builder project (`source: "shop-builder"`, linked back to the original). |
| **Ordered** | Opens in **Fix mode** (Section B5) — staff fix the ordered version directly and production files are written as `-r2`, `-r3`… The customer's price doesn't change. **Load as-is** (Section B5.2) is also available. |

- **Edit conflicts:** each save sends the `revision` it started from. If the Drive copy has a newer revision (the customer changed it meanwhile), the save is refused with *"This project was changed by the customer since you opened it. Reload to see their changes."* Nothing is overwritten.
- Every staff change records who and when in the project's `history` notes.
- **Photoshop export** and all staff tools (Part B) work on customer projects the same way.

---

## E5. Finding Projects (Drive search)

So Reopen Project can search quickly without opening every file, each `project.ssp.json` is tagged with Drive **appProperties** when it's written:

```
appProperties: {
  ssp_project_id: "prj_8f3k2a",
  ssp_source:     "customer-site",
  ssp_customer:   "crash out club",      // lower-case for search
  ssp_email:      "orders@example.com",
  ssp_order_id:   "48213",               // empty until ordered
  ssp_updated:    "2026-10-08T19:55:12Z"
}
```

- Search uses Drive's `files.list` with `appProperties has { key='ssp_order_id' and value='48213' }` for exact matches (order #, project ID, email), and a name-contains query for customer names.
- Recent = newest `ssp_updated` across all sources.
- The browser never talks to Drive; all searches go through `/api/project/search` (staff only).

---

## E6. Files & API

```
components/
  ShopTopBar.tsx            // Shop Builder title row + Reopen Project (top right)
  ReopenProjectDialog.tsx   // search, source filter, recent list, upload JSON, paste link/ID
lib/project/
  autoSave.ts               // shared "write project.ssp.json after files are created" (customer site, Shop Builder, DTF Stickers)
  conflict.ts               // revision check on save
  driveTags.ts              // set appProperties on every JSON write
app/api/project/
  search/route.ts           // GET — staff: search by name / order / email / ID, filter by source
  open/route.ts             // (existing) now opens any source; picks Shop Builder or DTF Stickers page
```

```
CUSTOMER_PROJECT_RETENTION_DAYS=90
CUSTOMER_JSON_WRITE_DEBOUNCE_SECONDS=10
```

---

## E7. Acceptance Criteria

- [ ] The Shop Builder shows **Reopen Project** in the top-right corner; staff only.
- [ ] Reopen Project searches by customer name, order #, email or project ID, filters by source, and lists the 25 most recent projects across all sources.
- [ ] **Every** project — Shop Builder, customer site and DTF Stickers — has a `project.ssp.json` in its Drive folder from the moment it's created.
- [ ] On the customer site, the JSON is written automatically as soon as the customer's files are created, with no buttons shown and no wait for the customer.
- [ ] Guest projects get a JSON too; abandoned ones with no order are deleted after 90 days.
- [ ] Staff can open a customer-site project in the Shop Builder: live if not ordered, copy if in a cart, Fix mode if ordered.
- [ ] A staff save is refused (nothing overwritten) if the customer changed the project since staff opened it.
- [ ] `source` is set once and never changes; `revision` increases on every write.
- [ ] Every JSON write sets the Drive appProperties used for search.

## E8. Test Cases

| Scenario | Expected |
|---|---|
| Staff click New Project in Shop Builder, don't save | Drive has the folder + `project.ssp.json` (`source: shop-builder`) |
| Customer uploads 2 images on the website (guest) | Drive has the files + `project.ssp.json` (`source: customer-site`) within seconds |
| Staff search "crash out" in Reopen Project | Customer's project appears with source "Customer site" |
| Staff search order #48213 | Exact match opens in Fix mode |
| Staff open an un-ordered customer project and resize an image | JSON updated, `revision` + 1; customer sees the new size on reload |
| Customer edits while staff have it open, then staff save | Staff save refused with the reload message |
| Project in customer's cart | Opens read-only; "Edit a copy" creates a linked Shop Builder project |
| Open a DTF Stickers project from Reopen Project | Opens in the DTF sticker maker with its cut setting |
| Drive JSON write fails twice, succeeds third time | Customer never sees an error; JSON present |
| Guest project, no order, 91 days old | Deleted by cleanup |

---

# Add to main README (`## Features` section)

```md
- **UV DTF cutout stickers** — Box 2 "Cut / No Cut" under Customer Name. Cut adds a standard
  2.5 mm Square Cut around every image, shown as a red rectangle in the preview with registration
  marks fitted to the sheet and a Start Cut box. Cut paths export as a `CutContour` spot-color layer.
- **Save Job / Reopen Job** (DTF sticker maker only) — Reopen Job and Export to Photoshop sit top
  right, Save Job below Box 2. Jobs save as JSON to Google Drive.
- **Staff tools** — Fix mode, load a project JSON exactly as it was ordered, export layered
  Photoshop files (art only) with all original uploads, and re-import Photoshop edits.
- **Top menu** — Shop Builder · DTF Stickers · Vinyl Stickers · Halftone Generator on every page.
- **Reopen Project (Shop Builder)** — staff search and open any project: shop, customer site or DTF Stickers.
- **A JSON for every project** — including customer-site projects, written to Google Drive automatically
  as soon as the customer's files are created, so staff can open them in the Shop Builder.
- **Automatic project JSON** — uploading files to Google Drive creates/updates the job's JSON automatically.
- **Version footer** — current version (v2.3.0) shown at the bottom of every builder page.
- Spec: `docs/GANGSHEET_ADDON_SPEC.md`
```

---

*Gang Sheet Builder Add-on Spec · **v2.3.0** · 2026-10-09 · DTF only*
