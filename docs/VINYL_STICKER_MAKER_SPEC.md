# Vinyl Sticker Maker — Project Spec

**Project:** Vinyl Sticker Maker — a **separate project** from the Southside Gang Sheet Builder.
**Status:** Parked. The UV DTF cutout stickers in the gang sheet builder come first; this project starts after that ships.
**Version:** v0.1.0 (spec draft)
**Where this goes:** the new project's `docs/VINYL_STICKER_MAKER_SPEC.md`.

> **Keep it separate.** This is its own repo / Next.js app. Don't import code from the gang sheet builder and don't add vinyl to it. If something is useful in both (registration marks, the Start Cut box, the red preview line), **copy** the file into this project. Mixing the two codebases is what caused the confusion.

---

## 1. What It Does

Customers upload artwork for **vinyl stickers**, choose a cut for **each image** — **Square Cut, Circle Cut or Contour Cut** — and set a border per image. The preview shows a red trace line around every image, and production gets a cutter-ready file with registration marks and a Start Cut box.

| | Vinyl Sticker Maker |
|---|---|
| Cut / No Cut | Per job |
| Per-image cut choice | **Square Cut · Circle Cut · Contour Cut** (one horizontal row) |
| Border | Per image, −/+ in 0.5 mm steps, default 2 mm |
| Default for a new image | Square Cut, 2 mm |

---

## 2. Page Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  VINYL STICKER MAKER                [ 📂 Reopen Job ]  [ ⬇ Export to Photoshop ] │
├──────────────────────────────────────────┬─────────────────────────────────────┤
│  ①  CUSTOMER NAME  [ ________________ ]  │  PREVIEW                            │
├──────────────────────────────────────────┤  ┌───────────────────────────────┐  │
│  ②  CUT    ( • ) Cut    (   ) No Cut     │  │ ■ ▶ START CUT #48213        ■ │  │
├──────────────────────────────────────────┤  │  ┏━━━━━━━┓  ╭━━━━╮  ┏━━━━━━┓  │  │
│  [ 💾 Save Job ]   Saved ✓               │  │  ┃ LOGO  ┃  ┃ ★  ┃  ┃ TEXT ┃  │  │
├──────────────────────────────────────────┤  │  ┗━━━━━━━┛  ╰━━━━╯  ┗━━━━━━┛  │  │
│  UPLOAD STICKER ART                      │  │ ■                           ■ │  │
│  ┌──────┐ logo-front.png   4.00"×3.20" ✕ │  └───────────────────────────────┘  │
│  │ img  │ [■Square] [Circle] [Contour]   │  ━━ = RED trace line (the cut)      │
│  └──────┘ Border [−] 2 mm [+]            │  ■  = registration marks            │
└──────────────────────────────────────────┴─────────────────────────────────────┘
```

- **Top right:** Reopen Job and Export to Photoshop.
- **Box 1:** Customer Name. **Box 2:** Cut / No Cut (default No Cut). **Save Job** below Box 2.
- **Upload Sticker Art:** each image row has its own cut choice and border.
- **Preview:** red trace line around every image, registration marks, Start Cut box.
- **No global border or expand / contract control.**

---

## 3. Per-Image Cut Options

The three cut choices sit **side by side in one horizontal row**, not stacked. The border control sits on the row below.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ┌──────┐  logo-front.png                     4.00" × 3.20"     ✕   │
│  │ img  │  CUT:  [■ Square Cut]  [ Circle Cut ]  [ Contour Cut ]     │  ← one row
│  └──────┘  BORDER:  [ − ]  2 mm (0.079")  [ + ]     Finished 4.16" × 3.36" │
└──────────────────────────────────────────────────────────────────────┘
```

- **Layout:** a horizontal segmented button group (`display: flex; flex-direction: row; gap: 8px;`). The selected one is filled. Order: **Square Cut · Circle Cut · Contour Cut**, each with a small icon (▢ ◯ ☁).
- On narrow phones (< 400 px) the buttons shrink to icon + short label and **stay on one row**.
- Changing one image's cut or border redraws **only that image's** red line and updates size, nesting and price.
- Optional **"Apply to all"** link copies this image's cut and border to every image.

---

## 4. The Cut Shapes

| Label | Id | What the customer gets | How it's built |
|---|---|---|---|
| **Square Cut** | `box` | Rectangle or square hugging the image | Tight bounding box of the art + border on all sides. Never padded to a perfect square. Square corners. |
| **Circle Cut** | `circle` | Round sticker | Minimum enclosing circle of the art's outline (Welzl's algorithm on the convex hull), radius + border |
| **Contour Cut** | `contour` | Follows the art's shape | Trace the art outline from the alpha mask → offset outward with round joins → smooth → simplify |

### Contour cut rules (the hard one)
- **Trace from the hardened alpha**, using the same `ALPHA_THRESHOLD` as the underbase. The cut must match what actually prints.
- **Offset in vector space** with Clipper2 (`clipper2-js`), `JoinType.Round`, `EndType.Polygon`. Do not dilate pixels — vector offset is exact and resolution-independent.
- **Fill interior holes.** A "C" or donut shape gets one outer cut, no inner cut (inner cuts = weeding, out of scope).
- **Merge loose pieces.** If the art has separated parts (e.g., text with gaps), the offset usually merges them. If it's still more than one piece after offset:
  - Apply a "close" pass: offset out by +X then back in by −X (X = 1/16") to bridge small gaps.
  - If still separate → show warning: *"Parts of your design will cut as separate stickers. Increase the border or choose Square Cut or Circle Cut."*
- **Smooth** with 2 passes of Chaikin smoothing, then **simplify** (Ramer–Douglas–Peucker, tolerance ~0.005") so the cutter doesn't chatter on thousands of tiny segments.
- **Minimum inside-corner radius 1/32"** — sharp inside notches tear vinyl.


---

## 5. Border Size (per image)

| Setting | Value |
|---|---|
| Where | Each image's row, under its cut choice |
| Unit | Millimeters, inches in grey (`2 mm (0.079")`) |
| Step | 0.5 mm |
| Default | 2 mm for every cut type; switching type keeps the border |
| Minimum | 0.5 mm (Circle, Contour), 0 mm (Square) |
| Maximum | 12 mm |
| Hold-to-repeat | Yes, every 120 ms |

- Below 1.5 mm on Circle or Contour, warn: *"Very tight border — small cutting shifts may clip your art."*
- The border is a physical distance, so it stays the same when the image is resized.
- The server clamps every border to the allowed range.

---

## 6. Preview — Red Trace Line

- Every image shows a **solid red line (`#E10600`, 2 px, non-scaling)** around it: a rectangle, circle or contour. Light red tint `rgba(225,6,0,0.06)` between art and line. Drawn on top of the art.
- Registration marks and the Start Cut box are drawn where they'll print.
- Redraw only the image that changed, in under 50 ms; trace contours once on upload in a Web Worker and cache them.

```tsx
// components/CutlineOverlay.tsx — polygons, so one renderer handles all three cut types
type Pt = [number, number];
interface Placed { id: string; xIn: number; yIn: number; cut?: { pathsIn: Pt[][] } }

export function CutlineOverlay({ items, sheetWIn, sheetHIn, pxPerIn, selectedId }:
  { items: Placed[]; sheetWIn: number; sheetHIn: number; pxPerIn: number; selectedId?: string }) {
  return (
    <svg className="pointer-events-none absolute inset-0"
      width={sheetWIn * pxPerIn} height={sheetHIn * pxPerIn}
      viewBox={`0 0 ${sheetWIn} ${sheetHIn}`} style={{ zIndex: 20 }}>
      {items.filter(i => i.cut).map(i => (
        <g key={i.id} transform={`translate(${i.xIn} ${i.yIn})`}>
          {i.cut!.pathsIn.map((pts, k) => (
            <path key={k}
              d={'M' + pts.map(p => p.join(' ')).join(' L') + ' Z'}
              fill="rgba(225,6,0,0.06)" stroke="#E10600"
              strokeWidth={i.id === selectedId ? 3 : 2}
              vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ))}
    </svg>
  );
}
```

Square and Circle cuts are returned as polygons too (4 points; 128 points).

---

## 7. Production Output

- **Cut file:** `CutContour` spot color, 0.25 pt, 100% magenta, on its own Separation layer in the production PDF.
- **Registration marks and Start Cut box:** same rules as the gang sheet builder's UV DTF spec (copy `marks.ts` and `startBox.ts` into this project; don't import them).

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

## 8. Nesting & Pricing

- MaxRects nesting uses each cut shape's bounding box; circles nest as their bounding square.
- Minimum 1/8" gap between cut lines; keep-out zones around marks and the Start Cut box.
- Price is computed and HMAC-signed server-side; cut type and border are part of the signed payload.

---

## 9. Data Model

```ts
export type CutShape = 'box' | 'circle' | 'contour'; // Square Cut, Circle Cut, Contour Cut

export interface SheetCutState {
  enabled: boolean;                       // Cut / No Cut
  perImage: Record<string, CutSettings>;  // kept while No Cut so it restores
}

export interface CutSettings {
  shape: CutShape;   // default 'box'
  offsetMm: number;  // default 2, step 0.5, min 0.5 (0 for box), max 12
}

export interface CutResult {
  paths: Array<Array<[number, number]>>; // inches, relative to art origin
  bboxIn: { x: number; y: number; w: number; h: number };
  pieceCount: number;                    // >1 → "separate stickers" warning
  warnings: Array<'TIGHT_BORDER' | 'MULTIPLE_PIECES' | 'ART_TOO_SMALL'>;
}
```

---

## 10. File Structure (new project)

```
lib/cutline/
  trace.ts      // alpha mask → outer polygon(s) (marching squares), fill holes
  offset.ts     // Clipper2 offset, close pass, merge pieces
  shapes.ts     // box, circle (Welzl), contour
  smooth.ts     // Chaikin + RDP
  marks.ts      // copied from the gang sheet builder
  startBox.ts   // copied from the gang sheet builder
  export.ts     // PDF CutContour layer + debug SVG
  index.ts      // buildCutPath(mask, settings, dpi): CutResult
workers/cutline.worker.ts
components/
  CutOptionsBox.tsx, ImageCutOptions.tsx, CutlineOverlay.tsx,
  SheetMarksOverlay.tsx, JobBar.tsx, TopRightActions.tsx
```

`.env`
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
```

Dependencies: `npm i clipper2-js pdf-lib`

---

## 11. Acceptance Criteria

- [ ] Each uploaded image shows **Square Cut · Circle Cut · Contour Cut in one horizontal row**, plus its own border −/+, defaulting to Square Cut 2 mm.
- [ ] The preview shows a solid red line around every image matching its cut (rectangle, circle, contour).
- [ ] Changing one image's cut or border redraws only that image, in under 50 ms after first trace.
- [ ] Square Cut hugs the image, never padded to a perfect square.
- [ ] Contour cut has no inner cuts, no inside corners tighter than 1/32", and warns when separated art can't merge.
- [ ] No Cut: no options, red lines, marks, Start Cut box or `CutContour` layer.
- [ ] Production PDF reads correctly in the cutter software.
- [ ] No code is shared with or imported from the gang sheet builder.

## 12. Test Cases

| Input | Expected |
|---|---|
| Upload 1 image | Horizontal cut row; red rectangle in preview |
| Change image 2 to Circle Cut 4 mm | Only image 2's line becomes a circle |
| Change image 3 to Contour Cut | Red line follows the art's shape |
| Solid circle logo | Contour ≈ Circle result |
| Donut / ring | One outer cut, no inner cut |
| "SOUTH SIDE" text with letter gaps | Contour merges into one piece at 3 mm |
| Two logos far apart, Contour | `MULTIPLE_PIECES` warning |
| Wide 6" × 2" banner, Square Cut 2 mm | 6.16" × 2.16" rectangle |
| Phone width (375 px) | Cut choices still on one row |

---

*Vinyl Sticker Maker Spec · **v0.1.0** · 2026-10-09*
