# Cutter Files (Teneth CCD `.plt`) — Portable Handoff

Everything another project needs to print registration marks and write cut
files the way the South Side DTF gang-sheet builder does. Copy the code in
Part 2 into the new project (see the porting checklist in Part 4); Part 1 and
Part 3 are the notes that explain *why* it is shaped the way it is, so the same
mistakes are not made twice.

Source snapshot: `southside-dtf` `main` @ `9cc9bdb` (app v2.5.0).

---

## Part 1 — How the system works

### 1.1 The machine and the file format

- **Cutter:** Teneth roll-fed vinyl cutter with a CCD camera (contour cutting on
  printed registration marks). Film is 24 in wide DTF film, printed across a
  22.3 in printable width.
- **File:** a `.plt` text file. It is the DMPL/HPGL hybrid that the CorelDRAW
  *CutterPro 5.2* macro (`CutterPro_5.2.gms` → `ToCutter.exe`) produces for this
  machine. Our files reproduce the structure of a known-working Corel export
  (`_195610_.plt`):

  ```text
  TB26,0,9660,7105;CT1;;:H A L0 ECN U U-7,8;D-7,8;D-7,0;U-7,0; ...cuts... U9660,0;PG;@@@@@@@@@@@@@@@@@@@@@
  ```

- **Units:** 1016 plotter units per inch (0.025 mm). `toUnits(in) = round(in * 1016)`.
- **Commands we use:**
  | Token | Meaning |
  |---|---|
  | `TB26,0,<feed>,<carriage>;` | Teneth CCD mark scan. The four-point window the camera reads: from the parked circle to the far corner given by `<feed>` (along the film) and `<carriage>` (across the film). Second field is always `0`. |
  | `CT1;` | Enter cutting mode after the scan. |
  | `;:H A L0 ECN U ` | DMPL header (home, absolute, L0, ECN, pen up). |
  | `U-7,8;D-7,8;D-7,0;U-7,0;` | Tiny origin tick copied from the Corel file. Harmless; kept so the file matches byte-for-byte in structure. |
  | `Ux,y;` / `Dx,y;` | Pen up / pen down move to absolute `x,y`. One vertex per command, semicolon separated. **Never** space-separated multi-point moves and **never** `V10`. |
  | `U<feed>,0;PG;` | Return to the far end of the window, then **PG** stops, clamps and rolls the film on to the next mark pair. |
  | `@` × 21 | Tail padding, as in the Corel file. |

- **MIME / delivery:** saved and uploaded as `text/plain`. Each sheet gets its own
  PLT, named exactly like its PNG with ` cut.plt` instead of `.png`.

### 1.2 Coordinate frame (the part that took longest to get right)

The PNG frame is *x across the sheet (in), y down the sheet (in), origin top-left*.
The plotter frame is different in three ways:

1. **Axes are transposed.** HPGL **X is the feed direction** (along the film),
   **Y is the carriage** (across the film). Sending 21.5 in on X once fed 21.5 in of
   film and the camera ran past every mark.
2. **Origin is the start mark centre**, not the sheet corner. The camera parks on
   one printed circle and everything is measured from it.
3. **The sheet goes on the bed upside down** (a 180° rotation — the roll unwinds
   bottom-edge first and the operator loads it that way). So the start mark is the
   **bottom-right circle in the PNG**, and both axes run *backwards* through the
   PNG from there: +X goes *up* the sheet, +Y goes *left* across it. Both stay
   positive, which is only true from that corner.

```ts
// origin = centre of the start (bottom-right) circle, in PNG inches
function toPlt(xIn, yIn, origin) {
  return {
    x: toUnits(origin.yIn - yIn), // feed, up the film
    y: toUnits(origin.xIn - xIn), // carriage, across the film to the left
  }
}
```

Things that were tried and were wrong: mirroring only the feed axis (cut
mirrored across the film), starting at the top-left circle (camera drove into
empty film), using the far-most mark row for the TB26 window (camera overshot
the near rows).

### 1.3 Registration marks

- **Shape:** filled **black 5 mm circles**. No white ring (the ring stole usable
  width; the camera does not need it). Squares and L-marks are **not** read by
  this CCD.
- **Across the sheet:** one circle hard against each film edge, `MARK_EDGE_IN =
  0.003 in` in from the printable edge, so centres are `MARK_GAP_X_IN =
  22.3 − 5mm − 0.006 ≈ 22.10 in` apart. (Measured off the hand-built sheet that
  cut correctly. Centring them on a fixed 21.5 in gap wasted a quarter inch — the
  only room the artwork and its cut boxes have.)
- **Down the sheet:** first row `MARK_LEAD_IN = 10 mm` from the leading edge; last
  row `MARK_TRAIL_IN = 0.75 in` + 5 mm before the trailing edge; rows **evenly
  spaced, never more than `MARK_SECTION_IN = 20 in` apart**. Even spacing matters:
  the camera advances the same distance to every row, so it cannot overshoot the
  way it did when the middle row sat closer than the last. 20 in is the most the
  cutter can take in one pass before the travel stop.
- **Start arrow:** a small black triangle (8 × 6 mm) with a white halo printed
  inboard of the start circle, pointing at it, so the operator can see where to
  park the camera.
- **Preview:** the same circles are drawn as an SVG overlay (red stroke), with the
  start one highlighted.

### 1.4 Cut boxes and packing constraints

- **Cut contour** = printed image + `CUT_MARGIN_IN = 2.5 mm` on every side,
  clamped to the sheet. (Square cut only; contour tracing was removed.)
- **Gutter** between neighbouring designs ≥ `CUT_GUTTER_IN = 2 × CUT_MARGIN_IN`
  or their cut boxes overlap and the knife runs through the next design.
- **Side inset** for artwork = `MARK_CLEARANCE_IN = MARK_EDGE_IN + MARK_SIZE_IN +
  CUT_MARGIN_IN` so the cut box clears the printed circle.
- **Hard requirement:** two **10.75 in** designs must fit side by side between
  the marks. That is what fixed the printable width at 22.3 in and caps the cut
  margin (`MAX_CUT_MARGIN_IN`).
- **Header/footer:** pre-cut sheets start art at `CUT_ART_START_IN` (label + 0.75 in)
  rather than the 1.5 in print margin, so the first mark row is near the leading
  edge; marks and the job label never print on the artwork.
- A design taller than `MARK_SECTION_IN` (20 in) + margins cannot be cut in one pass
  and is flagged (`cutTooTall`) in the UI.

### 1.5 Cut order and sections

- **Sections:** each *pair of adjacent mark rows* is one pass. For each section the
  file emits a self-contained block: `TB26` scan sized to **that pair only**
  (parked circle, its partner across the film, and the next row up), `CT1`,
  header, the cuts in that pair's own frame (origin = the near-right circle of
  the pair), `U<feed>,0;PG;`. This is the encoding that **cutter test 1A** proved;
  a single block for a whole long job ran the cutter into the travel stop.
- **Empty sections still emit a block**, otherwise the film never advances past them.
- A design belongs to the section its **leading edge** (the edge nearest the start
  mark, i.e. largest PNG `y`) falls in, so a design crossing a mark row is cut
  whole by the pass that reaches it first.
- **Order within a section:** nearest the start mark first; everything beside it
  (overlapping ≥ 0.25 in along the feed axis with the *seed*, not with a growing
  extent) is cut next, sweeping across the film; then the next row up. Grouping by
  overlap rather than a fixed band matters because the packer staggers designs.
- **Marks are ordered** bottom row first, right-to-left within a row.

### 1.6 One PLT per sheet, N of M

Jobs longer than one 200 in sheet are packed onto separate sheets. Each sheet is
its own PNG **and** its own PLT, both labelled `N of M` on the film and in the file
name, e.g.

```text
Customer 10/15 1200     (200) 2 of 3.png
Customer 10/15 1200     (200) 2 of 3 cut.plt
```

The shop builder downloads each PNG/PLT locally for the press and cutter PC and
uploads all of them to the Drive job folder; the customer builder uploads only.

### 1.7 Worked example (real output of `cutPlt`)

Five pieces on a 36 in pre-cut sheet (two 10.75 × 12 side by side at y = 2 in,
two 4 × 4 at y = 14.5, one 10.75 × 12 at y = 22):

```js
const pieces = [
  { xIn: 0.5,  yIn: 2,    widthIn: 10.75, heightIn: 12 },
  { xIn: 11.5, yIn: 2,    widthIn: 10.75, heightIn: 12 },
  { xIn: 0.5,  yIn: 14.5, widthIn: 4,     heightIn: 4 },
  { xIn: 5,    yIn: 14.5, widthIn: 4,     heightIn: 4 },
  { xIn: 0.5,  yIn: 22,   widthIn: 10.75, heightIn: 12 },
]
registrationMarkBounds(36)  // 3 rows × 2 circles, evenly 17.33 in apart:
// y = 0.394 (10 mm lead), 17.723, 35.053 (36 − 0.75 − 5 mm); x = 0.003 and 22.100
// first: true on the bottom-right circle (x 22.1, y 35.053)
cutPlt(pieces, 36)
```

Output (one line; broken here at the two section blocks):

```text
TB26,0,17607,22451;CT1;;:H A L0 ECN U U-7,8;D-7,8;D-7,0;U-7,0;
  U1070,11024;D1070,11024;D1070,22146;D13462,22146;D13462,11024;D1070,11024;U1070,11024;   ← 10.75×12 at y=22 (nearest start mark)
  U16818,13310;D16818,13310;D16818,17574;D21082,17574;D21082,13310;D16818,13310;U16818,13310;   ← 4×4 at x=5 (right-hand one first…)
  U16818,17882;D16818,17882;D16818,22146;D21082,22146;D21082,17882;D16818,17882;U16818,17882;   ← …then 4×4 at x=0.5
  U17607,0;PG;
TB26,0,17607,22451;CT1;;:H A L0 ECN U U-7,8;D-7,8;D-7,0;U-7,0;
  U3783,-103;D3783,-103;D3783,11019;D16175,11019;D16175,-103;D3783,-103;U3783,-103;   ← 10.75×12 at x=11.5 (right)
  U3783,11024;D3783,11024;D3783,22146;D16175,22146;D16175,11024;D3783,11024;U3783,11024;   ← 10.75×12 at x=0.5 (left)
  U17607,0;PG;
@@@@@@@@@@@@@@@@@@@@@
```

Reading it: `17607` = 17.33 in of feed to the next mark row; `22451` = 22.10 in
of carriage to the partner circle. Section 1 (bottom pair of rows) cuts the three
designs whose leading edge is below y = 17.72; section 2 re-registers on the
middle/top rows and cuts the two big ones at the top, right-hand design first.
A coordinate of `-103` (≈ 2.5 mm negative carriage) is a cut box clamped to the
sheet edge beyond the mark centre; the cutter accepts it.

---

## Part 2 — Code (verbatim from the repo)

Dependencies between these files:

```
lib/sheet-size.ts        (FILM_WIDTH_IN, SHEET_WIDTH_IN)
   └─ lib/compose-sheet.ts (PlacedSheetPiece type, SHEET_WIDTH_IN re-export, PNG drawing of marks/arrow)
         └─ lib/cut-layout.ts     ← the cutter core: marks, cut boxes, PLT writer
               ├─ lib/custom-cut.ts   (sticker-maker variant: polygon shapes, same PLT structure)
               ├─ lib/cutter-test.ts  (test-sheet variants 1A–1D, 2A)
               └─ components/cut-shape-overlay.tsx (preview SVG)
lib/sheet-name.ts        (job / PNG / PLT file names, N of M)
scripts/load-lib.mjs + scripts/verify-plt.mjs (tests)
```

### 2.1 `lib/sheet-size.ts`

`lib/sheet-size.ts`

```ts
/** The physical film on the roll. */
export const FILM_WIDTH_IN = 24

/**
 * Printable width across that film. Sized so two 10.75 in designs still fit
 * side by side with a 2.5 mm cut box and 5 mm crop marks at both edges; the
 * rest of the roll is the edge the printer cannot reach.
 */
export const SHEET_WIDTH_IN = 22.3

/** Unprintable film either side of the printable width. */
export const FILM_EDGE_IN = (FILM_WIDTH_IN - SHEET_WIDTH_IN) / 2
```

### 2.2 `lib/cut-layout.ts` — marks, cut boxes, PLT writer (the core)

`lib/cut-layout.ts`

```ts
import { SHEET_WIDTH_IN, type PlacedSheetPiece } from '@/lib/compose-sheet'

/**
 * Cut contour is the printed image plus this much on every side (2.5 mm).
 *
 * Two 10.75 in designs side by side is a hard requirement, and it sets the
 * ceiling: the pair uses 21.5 in of the clear film between the crop marks,
 * and four cut margins share whatever is left — one outboard of each design
 * and two back to back in the middle. See MAX_CUT_MARGIN_IN below.
 */
export const CUT_MARGIN_IN = 2.5 / 25.4
/** Neighbouring designs need this much between them or their cut boxes overlap. */
export const CUT_GUTTER_IN = CUT_MARGIN_IN * 2
/**
 * How much the cutter can take in one pass before it has to stop, advance the
 * belt and pick up the next pair of marks. Mark rows are never further apart
 * than this, so it always reaches the next registration before the stop.
 */
export const MARK_SECTION_IN = 20
/** Teneth CCD cameras lock onto filled 5 mm circles, not squares or L marks. */
export const MARK_SIZE_IN = 5 / 25.4
/** Gap kept between mark rows so neighbouring black circles do not touch. */
export const MARK_PAD_IN = 2 / 25.4
/**
 * The marks sit hard against both film edges, the same 0.003 in inset
 * measured off the hand-built sheet. Centring them on a fixed 21.5 in gap
 * threw away a quarter inch of the clear span between them, which is the
 * only room the artwork and its cut boxes have.
 */
export const MARK_EDGE_IN = 0.003
export const MARK_GAP_X_IN = SHEET_WIDTH_IN - MARK_SIZE_IN - MARK_EDGE_IN * 2
/** Clear film between the two printed circles: everything has to fit in here. */
export const MARK_CLEAR_SPAN_IN = MARK_GAP_X_IN - MARK_SIZE_IN
/** Widest design that must still fit two-up between the crop marks. */
export const MAX_TWO_UP_WIDTH_IN = 10.75
/** Largest cut margin that still lets two MAX_TWO_UP_WIDTH_IN designs sit side by side. */
export const MAX_CUT_MARGIN_IN = (MARK_CLEAR_SPAN_IN - MAX_TWO_UP_WIDTH_IN * 2) / 4
/**
 * How far artwork sits in from the film edge: far enough that its cut box
 * clears the printed circle.
 */
export const MARK_CLEARANCE_IN = MARK_EDGE_IN + MARK_SIZE_IN + CUT_MARGIN_IN
const MARK_ROW_GAP_IN = MARK_SIZE_IN + MARK_PAD_IN * 2
/** First crop-mark row, measured from the leading edge of the film. */
export const MARK_LEAD_IN = 10 / 25.4
/** Film after the last mark — enough for the camera, not another 10 in search. */
export const MARK_TRAIL_IN = 0.75
/** Small printed arrow at the leading-left circle so the camera start is obvious. */
export const START_ARROW_LENGTH_IN = 8 / 25.4
export const START_ARROW_WIDTH_IN = 6 / 25.4
export const PLT_UNITS_PER_IN = 1016

export type CutBox = {
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
}

export function cutBoxForPiece(piece: PlacedSheetPiece, sheetWidthIn: number, sheetHeightIn: number): CutBox {
  const widthIn = piece.widthIn + CUT_MARGIN_IN * 2
  const heightIn = piece.heightIn + CUT_MARGIN_IN * 2
  let xIn = piece.xIn - CUT_MARGIN_IN
  let yIn = piece.yIn - CUT_MARGIN_IN
  if (xIn < 0) xIn = 0
  else if (xIn + widthIn > sheetWidthIn) xIn = Math.max(0, sheetWidthIn - widthIn)
  if (yIn < 0) yIn = 0
  else if (yIn + heightIn > sheetHeightIn) yIn = Math.max(0, sheetHeightIn - heightIn)
  return { xIn, yIn, widthIn, heightIn }
}

export function cutPreviewBoxes(
  pieces: PlacedSheetPiece[],
  sheetWidthIn = SHEET_WIDTH_IN,
  sheetHeightIn: number,
) {
  return pieces.map((piece) => cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
}

export type PrintMark = CutBox & { color: string; shape: 'rect' | 'circle' }

function markStack(xIn: number, yIn: number): PrintMark[] {
  // Black registration circle only — no white ring around it.
  return [
    {
      xIn,
      yIn,
      widthIn: MARK_SIZE_IN,
      heightIn: MARK_SIZE_IN,
      color: '#000000',
      shape: 'circle',
    },
  ]
}

/**
 * Mark rows are evenly spaced from the start mark to the far end of the
 * sheet. The camera advances the same distance to every row, so it cannot
 * overshoot the way it did when the middle row sat closer than the last.
 */
function markYs(sheetHeightIn: number) {
  if (sheetHeightIn <= 0) return []
  const first = MARK_LEAD_IN
  const last = sheetHeightIn - MARK_TRAIL_IN - MARK_SIZE_IN
  const span = last - first
  if (span < MARK_ROW_GAP_IN) return [first]
  const steps = Math.max(1, Math.ceil(span / MARK_SECTION_IN - 1e-9))
  const pitch = span / steps
  return Array.from({ length: steps + 1 }, (_, index) => first + index * pitch)
}

function markXs(sheetWidthIn: number) {
  const left = Math.max(0, (sheetWidthIn - MARK_GAP_X_IN - MARK_SIZE_IN) / 2)
  const right = left + MARK_GAP_X_IN
  return { left, right }
}

export function registrationMarkBounds(
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
  pieces: PlacedSheetPiece[] = [],
) {
  const { left, right } = markXs(sheetWidthIn)
  const ys = markYs(sheetHeightIn)
  // The sheet goes on the bed upside down, so the bottom-right circle is the
  // one that presents itself first to the camera.
  const startRow = ys.length - 1
  return ys.flatMap((yIn, row) => [
    { xIn: left, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: false },
    { xIn: right, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: row === startRow },
  ])
}

export function registrationMarkRects(
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
  pieces: PlacedSheetPiece[] = [],
): PrintMark[] {
  return registrationMarkBounds(sheetHeightIn, sheetWidthIn, pieces).flatMap((mark) => markStack(mark.xIn, mark.yIn))
}

export type ArrowPoint = { xIn: number; yIn: number }

/**
 * Triangle inboard of the start crop mark, pointing out at it. The start
 * mark is now the bottom-right circle, so the arrow sits to its left where
 * there is room, in the footer below the artwork.
 */
export function startMarkArrowPoints(mark: CutBox): ArrowPoint[] {
  const cy = mark.yIn + mark.heightIn / 2
  const tipX = mark.xIn - MARK_PAD_IN - 0.6 / 25.4
  const length = START_ARROW_LENGTH_IN
  const half = START_ARROW_WIDTH_IN / 2
  return [
    { xIn: tipX, yIn: cy },
    { xIn: tipX - length, yIn: cy - half },
    { xIn: tipX - length, yIn: cy + half },
  ]
}

export function sheetHeightWithMarkTrail(
  sheetHeightIn: number,
  marks: Array<{ yIn: number; heightIn: number }>,
) {
  const lastMark = marks.reduce((max, mark) => Math.max(max, mark.yIn + mark.heightIn), 0)
  return Math.max(lastMark + MARK_TRAIL_IN, sheetHeightIn)
}

function toUnits(inches: number) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1: number, y1: number, x2: number, y2: number) {
  return `U${x1},${y1};D${x1},${y1};D${x1},${y2};D${x2},${y2};D${x2},${y1};D${x1},${y1};U${x1},${y1};`
}

function markCenterInches(mark: CutBox) {
  return {
    xIn: mark.xIn + mark.widthIn / 2,
    yIn: mark.yIn + mark.heightIn / 2,
  }
}

/** Roll-fed CCD origin is the bottom-right circle: last row first, then right to left. */
function marksFromStart(marks: CutBox[]) {
  return [...marks].sort((a, b) => {
    const ac = markCenterInches(a)
    const bc = markCenterInches(b)
    if (Math.abs(ac.yIn - bc.yIn) > 1e-9) return bc.yIn - ac.yIn
    return bc.xIn - ac.xIn
  })
}

/** Marks grouped into rows, starting at the parked bottom row and working up. */
function markRowsFromStart(marks: CutBox[]) {
  const rows: CutBox[][] = []
  for (const mark of marksFromStart(marks)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(markCenterInches(row[0]).yIn - markCenterInches(mark).yIn) < 0.05) row.push(mark)
    else rows.push([mark])
  }
  return rows
}

/**
 * The plotter frame is not the PNG frame. HPGL X is the feed direction and Y
 * is the carriage across the media, so the two axes are transposed.
 *
 * The sheet is laid on the bed upside down, which is a 180 degree rotation,
 * so both axes also run backwards through the PNG from the bottom-right
 * start circle: +X up the sheet, +Y across it to the left. Both stay
 * positive, which is only true from that corner.
 */
function toPlt(xIn: number, yIn: number, origin: { xIn: number; yIn: number }) {
  return {
    x: toUnits(origin.yIn - yIn),
    y: toUnits(origin.xIn - xIn),
  }
}

/**
 * TB26,0,feed,carriage is the four-point window the camera reads: the parked
 * circle, its pair across the film, and the next row up. Sizing it to the
 * furthest row instead made the camera run past the nearer rows.
 */
function scanWindow(frame: CutBox[], origin: { xIn: number; yIn: number }) {
  let feed = 0
  let carriage = 0
  for (const mark of frame) {
    const center = markCenterInches(mark)
    const point = toPlt(center.xIn, center.yIn, origin)
    feed = Math.max(feed, point.x)
    carriage = Math.max(carriage, point.y)
  }
  return { feed, carriage }
}

/** Tiny origin tick from the working Corel plugin file, then cuts, then return to the window width. */
const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'

/** Designs must share at least this much of the sheet's length to count as one row. */
const ROW_OVERLAP_IN = toUnits(0.25)

type PltBox = { x1: number; y1: number; x2: number; y2: number }

/**
 * Cut order is row by row, working outward from the parked start mark.
 *
 * The first cut is the design nearest the start mark. Everything sitting
 * beside it is cut next, sweeping side by side across the film, and only
 * then does the job move along to the next row.
 *
 * Rows are grouped by overlap rather than by a fixed tolerance. The packer
 * staggers designs, so neighbours that plainly sit side by side can start a
 * couple of inches apart; a fixed band split them into separate rows and the
 * knife appeared to skip designs near the start of the page.
 */
function boxesFromStart(boxes: CutBox[], origin: { xIn: number; yIn: number }): PltBox[] {
  const remaining: PltBox[] = boxes
    .map((box) => {
      const a = toPlt(box.xIn, box.yIn, origin)
      const b = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
      return {
        x1: Math.min(a.x, b.x),
        y1: Math.min(a.y, b.y),
        x2: Math.max(a.x, b.x),
        y2: Math.max(a.y, b.y),
      }
    })
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1)

  const order: PltBox[] = []
  while (remaining.length > 0) {
    const seed = remaining.shift() as PltBox
    const row = [seed]
    // Compare against the seed, not a growing extent, so one tall design
    // cannot chain the whole sheet into a single row.
    for (let i = 0; i < remaining.length; ) {
      if (remaining[i].x1 + ROW_OVERLAP_IN < seed.x2) row.push(remaining.splice(i, 1)[0])
      else i += 1
    }
    row.sort((a, b) => a.y1 - b.y1)
    order.push(...row)
  }
  return order
}

const DMPL_HEADER = ';:H A L0 ECN U '
const PLT_TAIL = '@'.repeat(21)

/** One register, cut and advance block: the structure proven by cutter test 1A. */
function sectionBlock(boxes: CutBox[], frame: CutBox[], origin: { xIn: number; yIn: number }) {
  const { feed, carriage } = scanWindow(frame, origin)
  const paths = boxesFromStart(boxes, origin)
    .map((box) => rectanglePath(box.x1, box.y1, box.x2, box.y2))
    .join('')
  return `TB26,0,${feed},${carriage};CT1;${DMPL_HEADER}${ORIGIN_TICK}${paths}U${feed},0;PG;`
}

/**
 * A cut file the machine can work through in passes.
 *
 * Each pair of mark rows gets its own block: register on those four marks,
 * cut what sits between them in that pair's own frame, then PG to stop,
 * clamp and roll the film on to the next pair. A single block for the whole
 * job ran the cutter into its travel stop on anything long; this is the
 * encoding that came back working from cutter test 1A.
 *
 * A design is cut by the section its leading edge falls in, so one that
 * crosses a mark row is still cut whole, by the pass that reaches it first.
 */
export function buildTenethPlt(boxes: CutBox[], marks: CutBox[] = []) {
  const rows = markRowsFromStart(marks)
  if (rows.length === 0) {
    const paths = boxesFromStart(boxes, { xIn: 0, yIn: 0 })
      .map((box) => rectanglePath(box.x1, box.y1, box.x2, box.y2))
      .join('')
    return `${DMPL_HEADER}${paths}U @`
  }

  const rowY = rows.map((row) => markCenterInches(row[0]).yIn)
  if (rows.length === 1) {
    return sectionBlock(boxes, rows[0], markCenterInches(rows[0][0])) + PLT_TAIL
  }

  // Leading edge is the one nearest the parked start mark, so the largest Y.
  const sectionOf = (box: CutBox) => {
    const leadingEdge = box.yIn + box.heightIn
    for (let i = 0; i < rowY.length - 1; i += 1) {
      if (leadingEdge > rowY[i + 1]) return i
    }
    return rowY.length - 2
  }

  const perSection: CutBox[][] = Array.from({ length: rows.length - 1 }, () => [])
  for (const box of boxes) perSection[sectionOf(box)].push(box)

  // Empty sections still need their block, or the film never advances past them.
  return perSection
    .map((sectionBoxes, index) =>
      sectionBlock(sectionBoxes, [...rows[index], ...rows[index + 1]], markCenterInches(rows[index][0])),
    )
    .join('') + PLT_TAIL
}

/**
 * One cut file per job, however long the sheet is. The belt bed feeds the
 * whole roll and re-registers on each mark pair down the sheet, so there is
 * no reason to split the job into separate files.
 */
export function cutPlt(
  pieces: PlacedSheetPiece[],
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
) {
  const boxes = pieces
    .map((piece) => cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
    .filter((box) => box.widthIn > 0 && box.heightIn > 0)
  if (boxes.length === 0) return ''
  return buildTenethPlt(boxes, registrationMarkBounds(sheetHeightIn, sheetWidthIn, pieces))
}
```

### 2.3 `lib/compose-sheet.ts` — the pieces the cutter code depends on

Only the parts relevant to cutting are reproduced: the piece types/constants and
the functions that paint the registration circles and start arrow onto the sheet
PNG. (`composeGangSheet` also draws labels and art and maps CMYK; keep your own
compositor and just add the `marks` / `startArrow` drawing.)

`lib/compose-sheet.ts` lines 1–37

```ts
import { canvasToPngBlob, loadImage } from '@/lib/image-utils'
import { mapRgbaThroughCmyk } from '@/lib/cmyk-map'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'

export type SheetPiece = {
  previewUrl: string
  widthIn: number
  heightIn: number
  /** Turned a quarter turn to nest better. widthIn/heightIn are already swapped. */
  rotated?: boolean
}

export type PlacedSheetPiece = SheetPiece & {
  xIn: number
  yIn: number
}

export const SHEET_GUTTER_IN = 0.125

/** Preferred space between designs; tightened toward the minimum only when it would cost film. */
export const PREFERRED_GUTTER_IN = 0.25

/** Widest to narrowest spacing to try, given a minimum the caller will not go below. */
function gutterChoices(minGutterIn: number) {
  const preferred = Math.max(PREFERRED_GUTTER_IN, minGutterIn)
  return [preferred, (preferred + minGutterIn) / 2, minGutterIn]
}
export { FILM_WIDTH_IN, SHEET_WIDTH_IN } from '@/lib/sheet-size'
export const LABEL_PT = 72
export const PRINT_MARGIN_IN = 1.5
export const LABEL_MARGIN_IN = 0.75
const LABEL_HEIGHT_IN = LABEL_PT / 72
const LABEL_PAD_IN = 0.125
export const ART_INSET_IN = LABEL_PAD_IN + LABEL_HEIGHT_IN + PRINT_MARGIN_IN
/** Pre-cut sheets skip the extra 1.5 in print margin so the first crop marks sit near the leading edge. */
export const CUT_ART_START_IN = LABEL_PAD_IN + LABEL_HEIGHT_IN + LABEL_MARGIN_IN

```

```ts
// …packing code omitted…
```

`lib/compose-sheet.ts` lines 420–479

```ts
function fillMarkCircle(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  diameter: number,
) {
  const radius = Math.max(1, diameter / 2)
  context.beginPath()
  context.arc(cx, cy, radius, 0, Math.PI * 2)
  context.closePath()
  context.fill()
}

function fillRegistrationMark(
  context: CanvasRenderingContext2D,
  mark: { xIn: number; yIn: number; widthIn: number; heightIn: number; color?: string },
  pxPerIn: number,
) {
  const cx = (mark.xIn + mark.widthIn / 2) * pxPerIn
  const cy = (mark.yIn + mark.heightIn / 2) * pxPerIn
  const diameter = Math.max(2, Math.min(mark.widthIn, mark.heightIn) * pxPerIn)
  context.imageSmoothingEnabled = true
  context.fillStyle = mark.color || '#000000'
  fillMarkCircle(context, cx, cy, diameter)
}

function fillPolygon(
  context: CanvasRenderingContext2D,
  points: Array<{ xIn: number; yIn: number }>,
  pxPerIn: number,
) {
  if (points.length < 3) return
  context.beginPath()
  points.forEach((point, index) => {
    const x = point.xIn * pxPerIn
    const y = point.yIn * pxPerIn
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.closePath()
  context.fill()
}

function fillStartArrow(
  context: CanvasRenderingContext2D,
  points: Array<{ xIn: number; yIn: number }>,
  pxPerIn: number,
) {
  const cx = points.reduce((sum, point) => sum + point.xIn, 0) / points.length
  const cy = points.reduce((sum, point) => sum + point.yIn, 0) / points.length
  const halo = points.map((point) => ({
    xIn: cx + (point.xIn - cx) * 1.9,
    yIn: cy + (point.yIn - cy) * 1.9,
  }))
  context.imageSmoothingEnabled = true
  context.fillStyle = '#ffffff'
  fillPolygon(context, halo, pxPerIn)
  context.fillStyle = '#000000'
  fillPolygon(context, points, pxPerIn)
}
```

`lib/compose-sheet.ts` lines 481–565

```ts
export async function composeGangSheet(opts: {
  pieces: PlacedSheetPiece[]
  sheetLengthIn: number
  /** Defaults to the roll printable width. Custom-cut jobs pass a page width. */
  sheetWidthIn?: number
  pxPerIn: number
  label?: string
  mapCmyk?: boolean
  marks?: Array<{ xIn: number; yIn: number; widthIn: number; heightIn: number; color?: string }>
  startArrow?: Array<{ xIn: number; yIn: number }>
}) {
  const sheetWidthIn = opts.sheetWidthIn && opts.sheetWidthIn > 0 ? opts.sheetWidthIn : SHEET_WIDTH_IN
  const width = Math.max(1, Math.round(sheetWidthIn * opts.pxPerIn))
  const height = Math.max(1, Math.round(opts.sheetLengthIn * opts.pxPerIn))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: Boolean(opts.mapCmyk) || Boolean(opts.marks?.length) })
  if (!context) throw new Error('Could not build the gang sheet preview.')

  context.clearRect(0, 0, width, height)

  if (opts.label) {
    const fontPx = Math.max(1, (LABEL_PT * opts.pxPerIn) / 72)
    context.font = `700 ${fontPx}px Arial, Helvetica, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#111111'
    const x = width / 2
    const labelY = (LABEL_MARGIN_IN + LABEL_HEIGHT_IN / 2) * opts.pxPerIn
    context.fillText(opts.label, x, labelY)
    context.fillText(opts.label, x, height - labelY)
  }

  for (const piece of opts.pieces) {
    if (!piece.previewUrl) continue
    const image = await loadImage(piece.previewUrl)
    const x = piece.xIn * opts.pxPerIn
    const y = piece.yIn * opts.pxPerIn
    const w = piece.widthIn * opts.pxPerIn
    const h = piece.heightIn * opts.pxPerIn

    // Safety net: contain the art in its rect rather than stretching it, and
    // centre whatever slack is left. With piecePrintSize feeding the packer the
    // slack is zero, but a mismatch must never distort a customer's print.
    const naturalW = image.naturalWidth || w
    const naturalH = image.naturalHeight || h
    // A turned piece is drawn in local space where the long edge runs along h.
    const boxW = piece.rotated ? h : w
    const boxH = piece.rotated ? w : h
    const scale = Math.min(boxW / Math.max(1, naturalW), boxH / Math.max(1, naturalH))
    const drawW = naturalW * scale
    const drawH = naturalH * scale
    const offsetX = (boxW - drawW) / 2
    const offsetY = (boxH - drawH) / 2

    if (piece.rotated) {
      context.save()
      context.translate(x, y)
      context.rotate(Math.PI / 2)
      context.drawImage(image, offsetX, -w + offsetY, drawW, drawH)
      context.restore()
      continue
    }

    context.drawImage(image, x + offsetX, y + offsetY, drawW, drawH)
  }

  if (opts.mapCmyk) {
    const pixels = context.getImageData(0, 0, width, height)
    mapRgbaThroughCmyk(pixels.data)
    context.putImageData(pixels, 0, 0)
  }

  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  for (const mark of opts.marks ?? []) {
    fillRegistrationMark(context, mark, opts.pxPerIn)
  }
  if (opts.startArrow && opts.startArrow.length >= 3) {
    fillStartArrow(context, opts.startArrow, opts.pxPerIn)
  }

  return canvasToPngBlob(canvas, width / sheetWidthIn)
}
```

### 2.4 How the builder wires it up (`lib/sheet-pages.ts` excerpt)

Pack options when pre-cut is on, and the per-sheet mark / cut-box computation.
`packSheetIntoPages` / `packSheetBestGutter` are the project's own shelf packer;
any packer that honours `packWidthIn`, `startYIn`, `sideInsetIn` and `minGutterIn`
will do.

`lib/sheet-pages.ts` lines 102–157

```ts
export function paginateGangSheet<T extends PackItem>(
  items: T[],
  options: { cutOut: boolean; sheetWidthIn?: number },
): SheetPagination<T> {
  const sheetWidthIn = options.sheetWidthIn ?? SHEET_WIDTH_IN
  const cutOut = options.cutOut
  const billableOpts = { packWidthIn: sheetWidthIn, startYIn: ART_INSET_IN }
  const printOpts = cutOut
    ? {
        packWidthIn: sheetWidthIn - MARK_CLEARANCE_IN * 2,
        startYIn: CUT_ART_START_IN,
        sideInsetIn: MARK_CLEARANCE_IN,
        minGutterIn: CUT_GUTTER_IN,
      }
    : billableOpts
  const startY = cutOut ? CUT_ART_START_IN : ART_INSET_IN
  // Billing allows PRINT_MARGIN_IN of grace before snapping, so a sheet can hold
  // that much more art than the tier and still bill as 200.
  const pageHeightIn = startY + MAX_SHEET_LENGTH_IN + PRINT_MARGIN_IN

  const { pages: layouts, tooLarge } = packSheetIntoPages(items, { ...printOpts, pageHeightIn })

  const pages: SheetPage<T>[] = layouts.map((layout, index) => {
    const uprightItems = layout.pieces.map((piece) => uprightItem(piece))
    const billable = cutOut ? packSheetBestGutter(uprightItems, billableOpts) : layout
    const billableHeightIn = Math.max(0, billable.contentEndY - ART_INSET_IN)
    const printedHeightIn = cutOut
      ? Math.max(0, layout.contentEndY - CUT_ART_START_IN)
      : billableHeightIn
    const printHeight = cutOut
      ? layout.contentEndY + CUT_ART_START_IN
      : layout.contentEndY + ART_INSET_IN
    const tier = sheetTierForArtLength(billableHeightIn)
    // Cut helpers only read geometry; server-side items carry no preview URL.
    const geometry: PlacedSheetPiece[] = layout.pieces.map((piece) => ({ previewUrl: '', ...piece }))
    const marks = cutOut ? registrationMarkRects(printHeight, sheetWidthIn, geometry) : []
    const markBounds = cutOut ? registrationMarkBounds(printHeight, sheetWidthIn, geometry) : []
    const first = markBounds.find((mark) => mark.first)
    return {
      index,
      layout,
      billableHeightIn,
      printedHeightIn,
      printHeight,
      billedLength: tier.length,
      price: tier.price,
      label: sheetLabel(tier.length),
      transfers: layout.pieces.length,
      marks,
      markBounds,
      startArrow: first ? startMarkArrowPoints(first) : [],
      cutBoxes: cutOut ? cutPreviewBoxes(geometry, sheetWidthIn, printHeight) : [],
      cutTooTall:
        cutOut && layout.pieces.some((piece) => piece.heightIn + CUT_MARGIN_IN * 2 > MARK_SECTION_IN),
    }
  })
```

### 2.5 Producing and delivering the files (`app/shop/page.tsx` excerpt)

`app/shop/page.tsx` lines 647–687

```tsx
      const stamp = jobStamp || sheetStamp()
      const who = customerName.trim()

      // One PNG (+ one PLT) per sheet, each labelled "N of M" on the film and in
      // its file name so the press and the cutter PC stay matched.
      const printFiles: Array<{ name: string; mimeType: string; blob: Blob }> = []
      const pltFiles: Array<{ name: string; content: string }> = []
      for (const page of pages) {
        const part = { index: page.index, count: sheetCount }
        const fileName = sheetFileName(who, page.billedLength, stamp, part)
        const png = await composeSheetPage(page, sheetPxPerIn(page, 14000, 150), pageJobName(page, stamp), true)
        if (printFiles.length > 0) await wait(200)
        downloadBlob(png, fileName)
        printFiles.push({ name: fileName, mimeType: 'image/png', blob: png })

        if (cutOut) {
          const plt = cutPlt(page.layout.pieces, page.printHeight)
          if (!plt) throw new Error(`Could not build the cutter PLT for sheet ${partLabel(page.index, sheetCount)}.`)
          const cutName = sheetCutFileName(who, page.billedLength, stamp, part)
          // Shop still downloads PLT locally for the cutter PC.
          await wait(200)
          downloadBlob(new Blob([plt], { type: 'text/plain' }), cutName)
          pltFiles.push({ name: cutName, content: plt })
        }
      }

      /** SPEC E2: every shop project gets a Drive folder + project.ssp.json. */
      const [firstPlt, ...otherPlts] = pltFiles
      const drive = await uploadJobToGoogleDrive({
        customerName: who,
        stamp,
        files: [
          ...printFiles,
          ...otherPlts.map((file) => ({
            name: file.name,
            mimeType: 'text/plain',
            blob: new Blob([file.content], { type: 'text/plain' }),
          })),
        ],
        cutterFile: firstPlt ? { name: firstPlt.name, content: firstPlt.content, mimeType: 'text/plain' } : undefined,
      })
```

### 2.6 `lib/sheet-name.ts` — job, PNG and PLT names

`lib/sheet-name.ts`

```ts
/**
 * "M/D HHMM" job stamp. Browsers use their own clock; the server passes the
 * shop's time zone (servers run on UTC).
 */
export function sheetStamp(at = new Date(), timeZone?: string) {
  if (timeZone) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(at)
        .map((part) => [part.type, part.value]),
    )
    return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour.padStart(2, '0')}${parts.minute.padStart(2, '0')}`
  }
  const time = `${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}`
  return `${at.getMonth() + 1}/${at.getDate()} ${time}`
}

function safeName(value: string, fallback: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

/**
 * Which sheet of the job this is. Multi-sheet jobs print "1 of 3", "2 of 3"…
 * on the label and in every file name so the press and cutter stay matched.
 * A legacy number is treated as a copy count (`… 2`).
 */
export type SheetPart = { index: number; count: number } | number

function partSuffix(part?: SheetPart) {
  if (part === undefined) return ''
  if (typeof part === 'number') return part > 1 ? ` ${part}` : ''
  if (!(part.count > 1)) return ''
  return ` ${part.index + 1} of ${part.count}`
}

export function sheetJobName(
  customerName: string,
  billedLengthIn: number,
  stamp = sheetStamp(),
  part?: SheetPart,
) {
  const who = safeName(customerName, 'Customer')
  const length = `${Math.max(12, Math.round(billedLengthIn))}`
  return `${who} ${stamp}     (${length})${partSuffix(part)}`
}

function fileSafe(name: string) {
  return name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sheetFileName(
  customerName: string,
  billedLengthIn: number,
  stamp = sheetStamp(),
  part?: SheetPart,
) {
  return `${fileSafe(sheetJobName(customerName, billedLengthIn, stamp, part))}.png`
}

export function sheetCutFileName(
  customerName: string,
  billedLengthIn: number,
  stamp = sheetStamp(),
  part?: SheetPart,
) {
  return `${fileSafe(sheetJobName(customerName, billedLengthIn, stamp, part))} cut.plt`
}
```

### 2.7 `components/cut-shape-overlay.tsx` — preview overlay

`components/cut-shape-overlay.tsx`

```tsx
import { startMarkArrowPoints, type CutBox } from '@/lib/cut-layout'
import type { CutShape } from '@/lib/custom-cut'

type CutShapeOverlayProps = {
  shapes: CutShape[]
  marks?: Array<CutBox & { first?: boolean }>
  sheetWidthIn: number
  sheetHeightIn: number
  /** Optional selected shape index — thicker red stroke (SPEC_2). */
  selectedIndex?: number
}

/** Solid red cut trace + registration marks (preview only; PLT uses CutContour). */
export function CutShapeOverlay({
  shapes,
  marks = [],
  sheetWidthIn,
  sheetHeightIn,
  selectedIndex,
}: CutShapeOverlayProps) {
  if (sheetWidthIn <= 0 || sheetHeightIn <= 0 || (shapes.length === 0 && marks.length === 0)) return null

  return (
    <div className="cut-overlay" aria-hidden="true">
      <svg
        className="cut-overlay-svg"
        viewBox={`0 0 ${sheetWidthIn} ${sheetHeightIn}`}
        preserveAspectRatio="none"
      >
        {shapes.map((shape, index) => {
          const d =
            shape.points.length > 0
              ? `M ${shape.points.map((point) => `${point.xIn} ${point.yIn}`).join(' L ')} Z`
              : ''
          if (!d) return null
          return (
            <path
              key={`shape-${index}`}
              className={`cut-preview-shape cut-preview-shape-${shape.kind}${
                selectedIndex === index ? ' selected' : ''
              }`}
              d={d}
            />
          )
        })}
        {marks.map((mark, index) => {
          const radius = Math.min(mark.widthIn, mark.heightIn) / 2
          return (
            <circle
              key={`mark-${index}`}
              className={`cut-reg-mark ${mark.first ? 'first' : ''}`}
              cx={mark.xIn + mark.widthIn / 2}
              cy={mark.yIn + mark.heightIn / 2}
              r={radius}
            />
          )
        })}
        {marks
          .filter((mark) => mark.first)
          .map((mark, index) => {
            const points = startMarkArrowPoints(mark)
            return (
              <polygon
                key={`start-arrow-${index}`}
                className="cut-start-arrow"
                points={points.map((point) => `${point.xIn},${point.yIn}`).join(' ')}
              />
            )
          })}
      </svg>
    </div>
  )
}
```

Matching CSS (from `app/globals.css`):

```css
.cut-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.cut-overlay-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.cut-preview-box { position: absolute; box-sizing: border-box; border: 2px solid #ff1a1a; background: transparent; }
.cut-reg-mark { fill: none; stroke: #ff1a1a; stroke-width: 0.05; }
.cut-reg-mark.first { stroke: #ff1a1a; }
.cut-start-arrow { fill: #ff1a1a; stroke: none; }
.cut-preview-shape {
  fill: rgba(225, 6, 0, 0.06);
  stroke: #e10600;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.cut-preview-shape.selected {
  stroke-width: 3;
  fill: rgba(225, 6, 0, 0.1);
}
```

### 2.8 `lib/custom-cut.ts` — sticker-maker variant (polygon shapes, same PLT structure)

Used by the UV DTF Sticker Maker. Same marks, same section/TB26 structure, but
cuts arbitrary closed polygons (`CutShape.points`) and allows a per-piece border.
Include it if the new project needs anything other than a rectangle around each
image.

`lib/custom-cut.ts`

```ts
/**
 * Square cut shapes for the DTF Sticker Maker (UV DTF only).
 * Fixed 2.5 mm box around art. PLT generation reuses the Teneth
 * mark-row / section structure from cut-layout.
 */

import type { PlacedSheetPiece } from '@/lib/compose-sheet'
import {
  CUT_MARGIN_IN,
  MARK_SECTION_IN,
  PLT_UNITS_PER_IN,
  cutBoxForPiece,
  registrationMarkBounds,
  type CutBox,
} from '@/lib/cut-layout'

/** UV DTF sticker maker supports Square Cut only. */
export type CutMode = 'box'

export type PieceCutSettings = {
  mode: CutMode
  /** Border outside the art, in inches. */
  offsetIn: number
}

export type CutShape = {
  kind: CutMode
  /** Bounding box used for packing / mark sections (always axis-aligned). */
  bounds: CutBox
  /** Closed path in sheet inches for preview + knife. */
  points: Array<{ xIn: number; yIn: number }>
}

const EPS = 1e-6
/** Default Square Cut border (2.5 mm) — same as CUT_MARGIN_IN. */
export const DEFAULT_BOX_OFFSET_IN = CUT_MARGIN_IN

function toUnits(inches: number) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function markCenterInches(mark: CutBox) {
  return {
    xIn: mark.xIn + mark.widthIn / 2,
    yIn: mark.yIn + mark.heightIn / 2,
  }
}

function toPlt(xIn: number, yIn: number, origin: { xIn: number; yIn: number }) {
  return {
    x: toUnits(origin.yIn - yIn),
    y: toUnits(origin.xIn - xIn),
  }
}

function polygonPath(
  points: Array<{ xIn: number; yIn: number }>,
  origin: { xIn: number; yIn: number },
) {
  if (points.length < 3) return ''
  const plotted = points.map((point) => toPlt(point.xIn, point.yIn, origin))
  const first = plotted[0]
  let out = `U${first.x},${first.y};D${first.x},${first.y};`
  for (let i = 1; i < plotted.length; i += 1) {
    out += `D${plotted[i].x},${plotted[i].y};`
  }
  out += `D${first.x},${first.y};U${first.x},${first.y};`
  return out
}

function boxPoints(box: CutBox) {
  return [
    { xIn: box.xIn, yIn: box.yIn },
    { xIn: box.xIn + box.widthIn, yIn: box.yIn },
    { xIn: box.xIn + box.widthIn, yIn: box.yIn + box.heightIn },
    { xIn: box.xIn, yIn: box.yIn + box.heightIn },
  ]
}

function artBounds(piece: PlacedSheetPiece): CutBox {
  return {
    xIn: piece.xIn,
    yIn: piece.yIn,
    widthIn: piece.widthIn,
    heightIn: piece.heightIn,
  }
}

function expandBounds(box: CutBox, offsetIn: number): CutBox {
  const pad = Math.max(0, offsetIn)
  return {
    xIn: box.xIn - pad,
    yIn: box.yIn - pad,
    widthIn: box.widthIn + pad * 2,
    heightIn: box.heightIn + pad * 2,
  }
}

function shapeForPiece(
  piece: PlacedSheetPiece,
  sheetWidthIn: number,
  sheetHeightIn: number,
  offsetIn: number,
): CutShape | null {
  const art = artBounds(piece)
  if (art.widthIn <= EPS || art.heightIn <= EPS) return null
  const pad = Math.max(0, offsetIn)
  const box =
    pad > 0 || art.widthIn > 0
      ? expandBounds(art, pad)
      : cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn)
  return { kind: 'box', bounds: box, points: boxPoints(box) }
}

export async function buildCutShapes(
  pieces: PlacedSheetPiece[],
  mode: CutMode,
  sheetWidthIn: number,
  sheetHeightIn: number,
  /** Border outside the art, in inches. */
  boxOffsetIn: number = DEFAULT_BOX_OFFSET_IN,
  /** Optional per-piece overrides — non-box modes are ignored (always Square Cut). */
  perPiece?: Array<PieceCutSettings | undefined>,
): Promise<CutShape[]> {
  void mode
  const fallbackOffset = Math.max(0, boxOffsetIn)
  const shapes: CutShape[] = []
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i]
    const settings = perPiece?.[i]
    const offsetIn = settings ? Math.max(0, settings.offsetIn) : fallbackOffset
    const shape = shapeForPiece(piece, sheetWidthIn, sheetHeightIn, offsetIn)
    if (shape) shapes.push(shape)
  }
  return shapes
}

const DMPL_HEADER = ';:H A L0 ECN U '
const PLT_TAIL = '@'.repeat(21)
const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'
const ROW_OVERLAP_IN = toUnits(0.25)

function marksFromStart(marks: CutBox[]) {
  return [...marks].sort((a, b) => {
    const ac = markCenterInches(a)
    const bc = markCenterInches(b)
    if (Math.abs(ac.yIn - bc.yIn) > 1e-9) return bc.yIn - ac.yIn
    return bc.xIn - ac.xIn
  })
}

function markRowsFromStart(marks: CutBox[]) {
  const rows: CutBox[][] = []
  for (const mark of marksFromStart(marks)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(markCenterInches(row[0]).yIn - markCenterInches(mark).yIn) < 0.05) row.push(mark)
    else rows.push([mark])
  }
  return rows
}

function scanWindow(frame: CutBox[], origin: { xIn: number; yIn: number }) {
  let feed = 0
  let carriage = 0
  for (const mark of frame) {
    const center = markCenterInches(mark)
    const point = toPlt(center.xIn, center.yIn, origin)
    feed = Math.max(feed, point.x)
    carriage = Math.max(carriage, point.y)
  }
  return { feed, carriage }
}

function shapesFromStart(shapes: CutShape[], origin: { xIn: number; yIn: number }): CutShape[] {
  type Entry = { shape: CutShape; x1: number; y1: number; x2: number; y2: number }
  const remaining: Entry[] = shapes
    .map((shape) => {
      const a = toPlt(shape.bounds.xIn, shape.bounds.yIn, origin)
      const b = toPlt(
        shape.bounds.xIn + shape.bounds.widthIn,
        shape.bounds.yIn + shape.bounds.heightIn,
        origin,
      )
      return {
        shape,
        x1: Math.min(a.x, b.x),
        y1: Math.min(a.y, b.y),
        x2: Math.max(a.x, b.x),
        y2: Math.max(a.y, b.y),
      }
    })
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1)

  const order: CutShape[] = []
  while (remaining.length > 0) {
    const seed = remaining.shift() as Entry
    const row = [seed]
    for (let i = 0; i < remaining.length; ) {
      if (remaining[i].x1 + ROW_OVERLAP_IN < seed.x2) row.push(remaining.splice(i, 1)[0])
      else i += 1
    }
    row.sort((a, b) => a.y1 - b.y1)
    order.push(...row.map((entry) => entry.shape))
  }
  return order
}

function sectionBlock(shapes: CutShape[], frame: CutBox[], origin: { xIn: number; yIn: number }) {
  const { feed, carriage } = scanWindow(frame, origin)
  const paths = shapesFromStart(shapes, origin)
    .map((shape) => polygonPath(shape.points, origin))
    .join('')
  return `TB26,0,${feed},${carriage};CT1;${DMPL_HEADER}${ORIGIN_TICK}${paths}U${feed},0;PG;`
}

export function cutPltForShapes(
  shapes: CutShape[],
  sheetHeightIn: number,
  sheetWidthIn: number,
  pieces: PlacedSheetPiece[],
) {
  if (shapes.length === 0) return ''
  const marks = registrationMarkBounds(sheetHeightIn, sheetWidthIn, pieces)
  const rows = markRowsFromStart(marks)
  if (rows.length === 0) {
    const origin = { xIn: 0, yIn: 0 }
    const paths = shapesFromStart(shapes, origin)
      .map((shape) => polygonPath(shape.points, origin))
      .join('')
    return `${DMPL_HEADER}${paths}U @`
  }
  const rowY = rows.map((row) => markCenterInches(row[0]).yIn)
  if (rows.length === 1) {
    return sectionBlock(shapes, rows[0], markCenterInches(rows[0][0])) + PLT_TAIL
  }

  const sectionOf = (shape: CutShape) => {
    const leadingEdge = shape.bounds.yIn + shape.bounds.heightIn
    for (let i = 0; i < rowY.length - 1; i += 1) {
      if (leadingEdge > rowY[i + 1]) return i
    }
    return rowY.length - 2
  }

  const perSection: CutShape[][] = Array.from({ length: rows.length - 1 }, () => [])
  for (const shape of shapes) perSection[sectionOf(shape)].push(shape)

  return (
    perSection
      .map((sectionShapes, index) =>
        sectionBlock(sectionShapes, [...rows[index], ...rows[index + 1]], markCenterInches(rows[index][0])),
      )
      .join('') + PLT_TAIL
  )
}

export function shapeTooTallForCutter(shapes: CutShape[]) {
  return shapes.some((shape) => shape.bounds.heightIn > MARK_SECTION_IN)
}
```

### 2.9 `lib/cutter-test.ts` — the test sheets that settled the encoding

Generates a short two-section test job in four encodings (1A–1D) and a 50 in
sheet through the real builder (2A). **1A is the one the machine obeyed** and is
what `buildTenethPlt` now emits. Keep this around: when something changes on the
cutter, print one test sheet and run the variants again.

`lib/cutter-test.ts`

```ts
import {
  MARK_EDGE_IN,
  MARK_GAP_X_IN,
  MARK_LEAD_IN,
  MARK_SECTION_IN,
  MARK_SIZE_IN,
  MARK_TRAIL_IN,
  PLT_UNITS_PER_IN,
  buildTenethPlt,
  type CutBox,
} from '@/lib/cut-layout'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'

/**
 * A short two-section job for working out how the cutter is told to stop,
 * clamp, advance the film and pick up the next pair of marks.
 *
 * Neither our cut files nor the CorelDRAW plugin currently do this, so there
 * is no known-good file to copy. These variants each encode the advance a
 * different way; run them on one printed test sheet and see which one the
 * machine obeys.
 */

/** Short enough to be cheap to print, long enough to need a second pass. */
export const TEST_PITCH_IN = 12
export const TEST_ROWS = 3
export const TEST_BOX_IN = 4

const HEADER = ';:H A L0 ECN U '
const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'
const TAIL = '@'.repeat(21)

function toUnits(inches: number) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1: number, y1: number, x2: number, y2: number) {
  return `U${x1},${y1};D${x1},${y1};D${x1},${y2};D${x2},${y2};D${x2},${y1};D${x1},${y1};U${x1},${y1};`
}

/** Mark rows down the test sheet, leading edge first. */
export function testMarkYs() {
  return Array.from({ length: TEST_ROWS }, (_, index) => MARK_LEAD_IN + index * TEST_PITCH_IN)
}

export function testSheetLengthIn() {
  const ys = testMarkYs()
  return ys[ys.length - 1] + MARK_SIZE_IN + MARK_TRAIL_IN
}

export function testMarkXs() {
  return { left: MARK_EDGE_IN, right: MARK_EDGE_IN + MARK_GAP_X_IN }
}

/**
 * Two boxes in each section, side by side, so the cut order is visible as
 * well as whether the section was reached at all. Numbered in cut order.
 */
export function testCutBoxes(): Array<CutBox & { label: string; section: number }> {
  const ys = testMarkYs()
  const boxes: Array<CutBox & { label: string; section: number }> = []
  // Sections run from the start mark (last row) back up the sheet. The two
  // sections sit at different X so that a section cut in the wrong place is
  // obvious on the film, rather than landing on its neighbour's boxes.
  const sections = [
    { top: ys[1], xs: [12, 4] },
    { top: ys[0], xs: [16, 8] },
  ]
  sections.forEach((section, index) => {
    const yIn = section.top + (TEST_PITCH_IN - TEST_BOX_IN) / 2 + MARK_SIZE_IN
    // Right-hand box first: that is the order the cutter works in.
    section.xs.forEach((xIn, position) => {
      boxes.push({
        xIn,
        yIn,
        widthIn: TEST_BOX_IN,
        heightIn: TEST_BOX_IN,
        label: String(index * 2 + position + 1),
        section: index + 1,
      })
    })
  })
  return boxes
}

type Origin = { xIn: number; yIn: number }

/** Same frame as the real cut files: feed up the sheet, carriage across it. */
function toPlt(xIn: number, yIn: number, origin: Origin) {
  return { x: toUnits(origin.yIn - yIn), y: toUnits(origin.xIn - xIn) }
}

function pathsFor(boxes: CutBox[], origin: Origin) {
  return boxes
    .map((box) => {
      const a = toPlt(box.xIn, box.yIn, origin)
      const b = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
      return rectanglePath(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.max(a.x, b.x),
        Math.max(a.y, b.y),
      )
    })
    .join('')
}

/** The start mark of a row: right-hand circle, centre. */
function rowOrigin(rowY: number): Origin {
  return { xIn: testMarkXs().right + MARK_SIZE_IN / 2, yIn: rowY + MARK_SIZE_IN / 2 }
}

type Section = { origin: Origin; feed: number; boxes: CutBox[] }

/** Sections ordered from the parked start mark back up the sheet. */
function testSections(): Section[] {
  const ys = testMarkYs()
  const all = testCutBoxes()
  return [0, 1].map((index) => {
    const nearRow = ys[ys.length - 1 - index]
    const farRow = ys[ys.length - 2 - index]
    return {
      origin: rowOrigin(nearRow),
      feed: toUnits(nearRow - farRow),
      boxes: all.filter((box) => box.section === index + 1),
    }
  })
}

const carriage = () => toUnits(MARK_GAP_X_IN)

/** 1A: one self-contained register, cut and advance block per section. */
function variantRepeatedBlocks() {
  return testSections()
    .map((section) => {
      const scan = `TB26,0,${section.feed},${carriage()};CT1;`
      return `${scan}${HEADER}${ORIGIN_TICK}${pathsFor(section.boxes, section.origin)}U${section.feed},0;PG;`
    })
    .join('') + TAIL
}

/** 1B: one scan naming every mark row, retried now the axes are right. */
function variantMarkList() {
  const sections = testSections()
  const origin = sections[0].origin
  const ys = testMarkYs()
  const xs = testMarkXs()
  const points: number[] = []
  // Every mark except the parked one, as feed,carriage pairs.
  for (let row = ys.length - 1; row >= 0; row -= 1) {
    for (const xIn of [xs.right, xs.left]) {
      const point = toPlt(xIn + MARK_SIZE_IN / 2, ys[row] + MARK_SIZE_IN / 2, origin)
      if (point.x === 0 && point.y === 0) continue
      points.push(point.x, point.y)
    }
  }
  const all = sections.flatMap((section) =>
    section.boxes.map((box) => ({ box, origin: sections[0].origin })),
  )
  const feed = toUnits((ys[ys.length - 1] - ys[0]))
  return `TB26,0,${points.join(',')};CT1;${HEADER}${ORIGIN_TICK}${pathsFor(all.map((entry) => entry.box), origin)}U${feed},0;PG;${TAIL}`
}

/** 1C: the second TB26 parameter, always zero so far, set to the section count. */
function variantSectionCount() {
  const sections = testSections()
  const origin = sections[0].origin
  const all = sections.flatMap((section) => section.boxes)
  return `TB26,${sections.length},${sections[0].feed},${carriage()};CT1;${HEADER}${ORIGIN_TICK}${pathsFor(all, origin)}U${sections[0].feed},0;PG;${TAIL}`
}

/** 1D: exactly what we ship today, as the control. */
function variantCurrent() {
  const sections = testSections()
  const origin = sections[0].origin
  const all = sections.flatMap((section) => section.boxes)
  return `TB26,0,${sections[0].feed},${carriage()};CT1;${HEADER}${ORIGIN_TICK}${pathsFor(all, origin)}U${sections[0].feed},0;PG;${TAIL}`
}

/** Test 2A: a full-length sheet at the widest mark spacing, through the real builder. */
export const TEST2_SHEET_IN = 50

export function test2MarkYs() {
  const first = MARK_LEAD_IN
  const last = TEST2_SHEET_IN - MARK_TRAIL_IN - MARK_SIZE_IN
  const steps = Math.max(1, Math.ceil((last - first) / MARK_SECTION_IN - 1e-9))
  const pitch = (last - first) / steps
  return Array.from({ length: steps + 1 }, (_, index) => first + index * pitch)
}

export function test2Pitch() {
  const ys = test2MarkYs()
  return ys[1] - ys[0]
}

/** Two boxes per section, staggered across the sheet so a misplaced pass shows. */
export function test2CutBoxes(): Array<CutBox & { label: string; section: number }> {
  const ys = test2MarkYs()
  const pitch = test2Pitch()
  const boxes: Array<CutBox & { label: string; section: number }> = []
  // Sections run from the start mark (last row) back up the sheet.
  for (let index = 0; index < ys.length - 1; index += 1) {
    const top = ys[ys.length - 2 - index]
    const yIn = top + (pitch - TEST_BOX_IN) / 2 + MARK_SIZE_IN
    const xs = index % 2 === 0 ? [12, 4] : [16, 8]
    xs.forEach((xIn, position) => {
      boxes.push({
        xIn,
        yIn,
        widthIn: TEST_BOX_IN,
        heightIn: TEST_BOX_IN,
        label: String(index * 2 + position + 1),
        section: index + 1,
      })
    })
  }
  return boxes
}

function test2Marks(): CutBox[] {
  const xs = testMarkXs()
  return test2MarkYs().flatMap((yIn) =>
    [xs.left, xs.right].map((xIn) => ({ xIn, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN })),
  )
}

/** Built by the shipping code, so this test exercises what real jobs will use. */
export function test2Plt() {
  return buildTenethPlt(test2CutBoxes(), test2Marks())
}

export type TestVariant = {
  id: string
  title: string
  idea: string
  watchFor: string
  plt: string
}

export function testVariants(): TestVariant[] {
  const ys = test2MarkYs()
  return [
    {
      id: '2A',
      title: `${TEST2_SHEET_IN} in sheet, marks ${test2Pitch().toFixed(1)} in apart`,
      idea: `Test 1A's structure at full length and the widest mark spacing worth using. ${TEST2_SHEET_IN} in of film, ${ys.length} mark rows, ${ys.length - 1} cutting passes instead of the ${Math.ceil((TEST2_SHEET_IN - 1) / TEST_PITCH_IN)} the 12 in spacing would need. Built by the shipping code, so this is exactly what real jobs now produce.`,
      watchFor: `Cuts two boxes, advances ${test2Pitch().toFixed(1)} in, re-reads, repeats. All ${(ys.length - 1) * 2} boxes cut in the right places.`,
      plt: test2Plt(),
    },
    {
      id: '1A',
      title: 'Repeated register / cut / advance blocks',
      idea: 'Each section gets its own TB26 scan, its own cuts in its own frame, and its own PG advance. The most literal way to say "cut this much, then move on".',
      watchFor: 'Cuts boxes 1 and 2, advances the film, re-reads the next pair, then cuts 3 and 4.',
      plt: variantRepeatedBlocks(),
    },
    {
      id: '1B',
      title: 'One scan naming every mark',
      idea: 'A single TB26 listing all six mark positions, letting the cutter plan the sections itself. Tried once before, but the feed and carriage axes were swapped at the time, so that test proved nothing.',
      watchFor: 'Reads several mark pairs up front, then cuts all four boxes, advancing as needed.',
      plt: variantMarkList(),
    },
    {
      id: '1C',
      title: 'Section count in the second TB26 field',
      idea: 'That field has been 0 in every file we have seen, including CorelDRAW\u2019s, which only ever writes single-section jobs. It may be a section count or a multi-mark mode flag.',
      watchFor: 'Same as 1A, but driven by the cutter rather than by repeated blocks.',
      plt: variantSectionCount(),
    },
    {
      id: '1D',
      title: 'Control: what we ship today',
      idea: 'One scan, every cut, one advance at the end. Included so you can see the current failure on the same sheet as the others.',
      watchFor: 'Expected to cut boxes 1 and 2, then run out of travel or cut 3 and 4 in the wrong place.',
      plt: variantCurrent(),
    },
  ]
}
```

The staff page `app/shop/cutter-test/page.tsx` just renders these variants as
downloadable PNG + PLT pairs; not reproduced here.

### 2.10 Tests — `scripts/load-lib.mjs` and `scripts/verify-plt.mjs`

The verify script bundles the *real* module with esbuild and asserts the file
structure, axis directions, section count and ordering. (A hand-written copy of
the geometry drifted from the real code more than once and passed while the
shipped output was wrong — hence `loadLib`.)

`scripts/load-lib.mjs`

```js
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Import a library module the way the app does.
 *
 * The verification scripts used to re-implement the cut geometry by hand and
 * check the copy. The copy drifted from the real code more than once, which
 * meant the checks passed while the shipped output was something else. This
 * bundles the actual module so the checks run against what really ships.
 */
export async function loadLib(entry) {
  const out = join(mkdtempSync(join(tmpdir(), 'verify-')), 'bundle.mjs')
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    alias: { '@': root },
    logLevel: 'error',
  })
  return import(pathToFileURL(out).href)
}
```

`scripts/verify-plt.mjs`

```js
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLib } from './load-lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const layout = readFileSync(join(root, 'lib/cut-layout.ts'), 'utf8')
const names = readFileSync(join(root, 'lib/sheet-name.ts'), 'utf8')
const page = readFileSync(join(root, 'app/page.tsx'), 'utf8')
const pages = readFileSync(join(root, 'lib/sheet-pages.ts'), 'utf8')

const cut = await loadLib('lib/cut-layout.ts')
const { buildTenethPlt, MARK_SIZE_IN, MARK_GAP_X_IN, PLT_UNITS_PER_IN } = cut

const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'
const WORKING_HEAD = 'TB26,0,9660,7105;CT1;;:H A L0 ECN U U-7,8;D-7,8;D-7,0;U-7,0;'
const toUnits = (inches) => Math.round(inches * PLT_UNITS_PER_IN)

const circle = (xIn, yIn) => ({ xIn, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN })
const near = { xIn: 2, yIn: 1.875, widthIn: 4, heightIn: 3 }
const far = { xIn: 8, yIn: 12, widthIn: 5, heightIn: 2 }

const leftMark = circle(0.01, 10 / 25.4)
const rightMark = circle(0.01 + MARK_GAP_X_IN, 10 / 25.4)
const midLeft = circle(0.01, 10)
const midRight = circle(0.01 + MARK_GAP_X_IN, 10)
const trailingLeft = circle(0.01, 20)
const trailingRight = circle(0.01 + MARK_GAP_X_IN, 20)
const twoRows = [rightMark, trailingRight, leftMark, trailingLeft]
const threeRows = [rightMark, midRight, trailingRight, leftMark, midLeft, trailingLeft]

// Real output from the shipping builder, not a copy of it.
const plt = buildTenethPlt([near, far], twoRows)
const threePlt = buildTenethPlt([near, far], threeRows)

const carriage = toUnits(MARK_GAP_X_IN)
const twoRowFeed = toUnits(20 - 10 / 25.4)
const threeRowFeed = toUnits(20 - 10)
const coords = [...plt.matchAll(/[UD](-?\d+),(-?\d+)/g)].map(([, x, y]) => [Number(x), Number(y)])
const tb26 = [...plt.matchAll(/TB26,([^;]+);/g)].map((m) => m[1].split(',').map(Number))

const checks = [
  // Structure of the file, matched against the Corel plugin output that works.
  [plt.startsWith(`TB26,0,${twoRowFeed},${carriage};CT1;`), 'opens with the mark window then CT1'],
  [plt.includes(`;:H A L0 ECN U ${ORIGIN_TICK}`), 'DMPL header and origin tick follow the scan'],
  [plt.trimEnd().endsWith('@'.repeat(21)), 'pads with @ like the working Corel file'],
  [!plt.includes('V10'), 'no V10'],
  [WORKING_HEAD.startsWith('TB26,0,'), 'working Corel file uses the same TB26 prefix'],
  [WORKING_HEAD.includes(';CT1;;:H A L0 ECN U U-7,8;'), 'working Corel file is TB26, CT1, header, origin tick'],
  [/U\d+,\d+;D\d+,\d+;/.test(plt), 'cut vertices are semicolon separated, one command each'],
  [!/D \d+,\d+ \d+,\d+/.test(plt), 'no space separated multi point moves'],

  // The scan window: the next mark row, never the furthest.
  [tb26.length === 1, `a two row sheet is one pass (${tb26.length})`],
  [tb26[0].length === 3 && tb26[0][0] === 0, 'TB26 carries a mode flag then the window corner'],
  [tb26[0][1] === twoRowFeed && tb26[0][2] === carriage, 'window is one row of feed, then the carriage span'],
  [tb26[0][1] < carriage, `feed ${(tb26[0][1] / PLT_UNITS_PER_IN).toFixed(1)} in is along the sheet, not the ${MARK_GAP_X_IN.toFixed(1)} in width`],
  [(threePlt.match(/TB26/g) || []).length === 2, 'a three row sheet is two passes'],
  [threePlt.startsWith(`TB26,0,${threeRowFeed},${carriage};CT1;`), 'each pass reaches only its own next row'],

  // Axes and origin: bottom-right start, feed up the film, carriage across.
  [coords.every(([x, y]) => x >= -10 && y >= -10), 'every coordinate runs forward from the start mark'],
  [coords.every(([, y]) => y <= toUnits(22)), 'no coordinate runs off the far side of the film'],

  // Source level intent, so the reasoning cannot be quietly undone.
  [layout.includes('x: toUnits(origin.yIn - yIn)'), 'feed runs up the film from the bottom start mark'],
  [layout.includes('y: toUnits(origin.xIn - xIn)'), 'the carriage runs across from the start mark'],
  [layout.includes('return bc.yIn - ac.yIn'), 'marks are ordered from the bottom of the sheet up'],
  [layout.includes('return bc.xIn - ac.xIn'), 'each row is ordered from the right'],
  [layout.includes('function sectionBlock'), 'the file is built from per-section blocks'],
  [layout.includes('U${feed},0;PG;'), 'each block ends with its own advance'],
  [layout.includes('Empty sections still need their block'), 'a section with no cuts still advances the film'],
  [layout.includes('function boxesFromStart'), 'cuts are ordered outward from the start mark'],
  [layout.includes('row.sort((a, b) => a.y1 - b.y1)'), 'designs in a row are cut side by side'],
  [layout.includes('ROW_OVERLAP_IN'), 'rows are grouped by overlap, not a fixed band'],
  [layout.includes('MARK_SECTION_IN = 20'), 'mark rows sit no more than 20 in apart'],
  [layout.includes('CUT_MARGIN_IN = 2.5 / 25.4'), 'the cut box is 2.5 mm around each design'],
  [layout.includes('CUT_GUTTER_IN = CUT_MARGIN_IN * 2'), 'neighbouring cut boxes cannot overlap'],
  [!layout.includes('cutPltSections'), 'the job is not split into separate files'],
  [layout.includes('export function cutPlt('), 'the whole job builds one cut file'],

  // Filenames and the builder wiring.
  [!names.includes('sectionCount'), 'cut file names carry no section number'],
  [names.includes('cut.plt`'), 'the cut file is named "<job> cut.plt"'],
  [!page.includes('for (const section of'), 'the builder downloads a single cut file'],
  [pages.includes('minGutterIn: CUT_GUTTER_IN') && page.includes('paginateGangSheet('), 'pre-cut packing keeps designs two cut boxes apart'],
  [page.includes('cutTooTall'), 'a design too tall for one pass is flagged'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`PLT checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(`\n${plt.slice(0, 150)}`)
console.log('cut files match the Corel structure and advance once per section')
```

Other related scripts in the repo (not reproduced): `verify-mark-layout.mjs`,
`verify-reg-marks.mjs`, `verify-cut-file.mjs`, `verify-cutter-test.mjs`.

---

## Part 3 — History: what was tried and why it changed

Condensed from the commit log of `lib/cut-layout.ts` (Aug–Sep 2026), oldest first.
Each line is a thing that *did not work* and what replaced it.

| Was | Problem | Now |
|---|---|---|
| Square / L registration marks | Teneth CCD does not read them | Filled 5 mm black circles |
| White ring around each circle | Stole ~0.2 in of usable width | Bare black circle |
| Marks placed on design rows / "3 pairs per 30 in" patterns | Camera searched past the last pair or stopped mid-sheet | Evenly spaced rows ≤ 20 in apart from leading edge to trailing edge |
| Marks centred on a fixed 21.5 in gap | Wasted a quarter inch of clear film | Marks 0.003 in off each film edge; gap derived from sheet width |
| 22 in printable width | PNG 0.25 in wider than printer could lay down | 21.75 → 21.93 → **22.3 in** (so two 10.75 in designs fit) |
| Mixed HPGL work-area/page-feed with DMPL, Y from trailing edge | Camera looked down empty film | Artcut-style DMPL, origin at the parked start mark |
| `TB26` = bounding box of all marks | Camera searched whole page | `TB26` = window to the **next** mark pair only |
| `TB26,0,0,0` | Zero-size scan, head sat still | Non-zero feed/carriage window |
| `TB26` listing every mark centre | Camera kept re-reading the first mark | Four-point window per section |
| Window sent on X across the film | X is the feed axis, so it fed 21.5 in of film | Axes transposed: X = feed, Y = carriage |
| Start at top-left circle, +Y down | Sheet is loaded upside down; mirrored/overshot | Start at **bottom-right**; +X up, +Y left |
| Flip feed only | Cut mirrored across the film | Full 180° (both axes) |
| One block for the whole job | Long sheets hit the travel stop | One register/cut/advance block per mark-row pair (test 1A) |
| Split long jobs into separate 30 in PLT files | Unnecessary; belt bed re-registers per pair | One PLT per sheet, sections inside it |
| Cut in packing order (tallest first) | Knife opened mid-sheet | Nearest the start mark first |
| Lead ordering on X | Travelled up the feed axis, skipped neighbours | Row grouping by overlap, sweep across, then up |
| 2 mm → 0.3 in → 0.07 → 0.08 → 0.125 in cut box | Each either too small or broke the 10.5/10.75 in two-up | **2.5 mm**, with the two-up requirement asserted |

Practical operator notes that fell out of this:

- Load the sheet **upside down** on the bed; park the camera on the **bottom-right**
  circle (the one with the arrow). Loading it the right way up cuts mirrored.
- The job label and crop marks are kept off the artwork; the cut box, not the art,
  is what has to clear the circles.
- The 20 in section limit is a cutter travel limit, not a preference.

---

## Part 4 — Porting checklist

1. Copy `lib/sheet-size.ts`, `lib/cut-layout.ts`, `lib/sheet-name.ts` as-is. Fix the
   `@/lib/...` import alias to the new project's path style.
2. Provide a `PlacedSheetPiece`-shaped type (`xIn, yIn, widthIn, heightIn,
   previewUrl, rotated?`) — only geometry is read by the cutter code, so
   `previewUrl: ''` is fine server-side.
3. When pre-cut is on, pack with: width `SHEET_WIDTH_IN − 2·MARK_CLEARANCE_IN`,
   side inset `MARK_CLEARANCE_IN`, start Y `CUT_ART_START_IN`, minimum gutter
   `CUT_GUTTER_IN`. Keep designs ≤ 20 in tall or flag them.
4. Sheet print height = last content Y + `CUT_ART_START_IN`. Compute
   `registrationMarkRects(printHeight)` and `registrationMarkBounds(printHeight)`;
   draw the circles and `startMarkArrowPoints(firstMark)` onto the PNG (section 2.3)
   and in the preview (2.7).
5. `const plt = cutPlt(pieces, printHeight)`; save as `text/plain` named
   `sheetCutFileName(customer, billedLength, stamp, {index, count})`; pair it with the
   PNG named `sheetFileName(...)` with the same arguments.
6. Copy `scripts/load-lib.mjs` + `scripts/verify-plt.mjs` (needs `esbuild` as a dev
   dependency) and run `node scripts/verify-plt.mjs` in CI. Adjust the three
   source-grep checks at the bottom that reference `app/page.tsx` /
   `lib/sheet-pages.ts` to the new project's files, or delete them.
7. Optional: `lib/cutter-test.ts` + a page to download its variants, for the next
   time the machine needs re-validating.
8. Do **not** change `PLT_UNITS_PER_IN`, the DMPL header, the `TB26` second field,
   the `@` tail, or the axis mapping without running a physical test sheet.
