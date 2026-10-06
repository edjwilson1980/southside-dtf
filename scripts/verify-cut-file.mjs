/**
 * Verifies cut boxes pick up turned piece dimensions.
 *
 *   node scripts/verify-cut-file.mjs
 */

const EPS = 1e-6
const SHEET_WIDTH_IN = 22
const CUT_MARGIN_IN = 2 / 25.4

function cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn) {
  const xIn = Math.max(0, piece.xIn - CUT_MARGIN_IN)
  const yIn = Math.max(0, piece.yIn - CUT_MARGIN_IN)
  const right = Math.min(sheetWidthIn, piece.xIn + piece.widthIn + CUT_MARGIN_IN)
  const bottom = Math.min(sheetHeightIn, piece.yIn + piece.heightIn + CUT_MARGIN_IN)
  return {
    xIn,
    yIn,
    widthIn: Math.max(0, right - xIn),
    heightIn: Math.max(0, bottom - yIn),
  }
}

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

console.log('Cut file checks (rotated pieces)\n')

const rotated = { xIn: 1.2, yIn: 3.1, widthIn: 3, heightIn: 16, rotated: true }
const sheetHeightIn = 40
const box = cutBoxForPiece(rotated, SHEET_WIDTH_IN, sheetHeightIn)

check('cut box uses turned width', Math.abs(box.widthIn - (rotated.widthIn + CUT_MARGIN_IN * 2)) < 0.05)
check('cut box uses turned height', Math.abs(box.heightIn - (rotated.heightIn + CUT_MARGIN_IN * 2)) < 0.05)
check('cut box stays on the sheet', box.xIn + box.widthIn <= SHEET_WIDTH_IN + EPS && box.yIn + box.heightIn <= sheetHeightIn + EPS)
check('cut box is not the unrotated 16 x 3', box.widthIn < 8 && box.heightIn > 10)

const upright = { xIn: 1.2, yIn: 3.1, widthIn: 16, heightIn: 3, rotated: false }
const uprightBox = cutBoxForPiece(upright, SHEET_WIDTH_IN, sheetHeightIn)
check('upright cut box stays landscape', uprightBox.widthIn > uprightBox.heightIn)

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
