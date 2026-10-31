/**
 * Manual gang sheets: the customer places every transfer themselves (`/manual`).
 *
 * The rules mirror what the packer guarantees on its own, so a hand-made layout
 * goes through the same PNG compose, cutter PLT, Drive upload and cart code as an
 * automatic one (see `manualSheetPage`, which returns the same `SheetPage` shape as
 * `paginateGangSheet`).
 */
import {
  ART_INSET_IN,
  CUT_ART_START_IN,
  PRINT_MARGIN_IN,
  SHEET_GUTTER_IN,
  packSheetBestGutter,
  type PackItem,
  type PlacedSheetPiece,
} from '@/lib/compose-sheet'
import {
  CUT_GUTTER_IN,
  CUT_MARGIN_IN,
  MARK_CLEARANCE_IN,
  MARK_SECTION_IN,
  cutPreviewBoxes,
  registrationMarkBounds,
  registrationMarkRects,
  startMarkArrowPoints,
} from '@/lib/cut-layout'
import { sheetTierForArtLength, type SheetPage } from '@/lib/sheet-pages'
import { sheetLabel, type SheetOption } from '@/lib/sheet-pricing'

const EPS = 1e-6

export type ManualSheetOptions = {
  /** Working length the customer picked (a ladder tier). */
  workingLengthIn: number
  cutOut: boolean
  sheetWidthIn: number
  ladder: SheetOption[]
  /** Width named on labels (the media sold). */
  labelWidthIn?: number
}

/** Where art may go on a manual sheet, in inches from the sheet's top-left corner. */
export type ManualArtArea = {
  left: number
  right: number
  top: number
  bottom: number
  /** Full film length of the working sheet (label strips at both ends). */
  filmLengthIn: number
  /** Smallest space allowed between two designs. */
  minGapIn: number
}

export function manualArtArea(opts: Pick<ManualSheetOptions, 'workingLengthIn' | 'cutOut' | 'sheetWidthIn'>): ManualArtArea {
  const top = opts.cutOut ? CUT_ART_START_IN : ART_INSET_IN
  const side = opts.cutOut ? MARK_CLEARANCE_IN : 0
  // Same grace the billing gives the packer: a tier holds PRINT_MARGIN_IN more art than its name.
  const bottom = top + opts.workingLengthIn + PRINT_MARGIN_IN
  return {
    left: side,
    right: opts.sheetWidthIn - side,
    top,
    bottom,
    filmLengthIn: bottom + top,
    minGapIn: opts.cutOut ? CUT_GUTTER_IN : SHEET_GUTTER_IN,
  }
}

export type ManualProblem =
  | { index: number; kind: 'outside' }
  | { index: number; kind: 'too-tall' }
  | { index: number; kind: 'overlap' | 'too-close'; other: number }

/** Every rule a placed piece breaks. Pieces are as placed: widthIn/heightIn already turned. */
export function validateManualLayout(
  pieces: Array<Pick<PlacedSheetPiece, 'xIn' | 'yIn' | 'widthIn' | 'heightIn'>>,
  area: ManualArtArea,
  cutOut: boolean,
): ManualProblem[] {
  const problems: ManualProblem[] = []
  pieces.forEach((piece, index) => {
    if (
      piece.xIn < area.left - EPS ||
      piece.xIn + piece.widthIn > area.right + EPS ||
      piece.yIn < area.top - EPS ||
      piece.yIn + piece.heightIn > area.bottom + EPS
    ) {
      problems.push({ index, kind: 'outside' })
    }
    if (cutOut && piece.heightIn + CUT_MARGIN_IN * 2 > MARK_SECTION_IN + EPS) {
      problems.push({ index, kind: 'too-tall' })
    }
  })
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]
      const b = pieces[j]
      const dx = Math.max(b.xIn - (a.xIn + a.widthIn), a.xIn - (b.xIn + b.widthIn))
      const dy = Math.max(b.yIn - (a.yIn + a.heightIn), a.yIn - (b.yIn + b.heightIn))
      const apart = Math.max(dx, dy)
      if (apart < -EPS) {
        problems.push({ index: i, kind: 'overlap', other: j }, { index: j, kind: 'overlap', other: i })
      } else if (apart < area.minGapIn - EPS) {
        problems.push({ index: i, kind: 'too-close', other: j }, { index: j, kind: 'too-close', other: i })
      }
    }
  }
  return problems
}

/**
 * Place `remaining` items with the packer, below everything already placed, inside
 * the working area. Items that do not fit come back in `unplaced`.
 */
export function autoArrangeRemaining<T extends PackItem>(
  placed: Array<Pick<PlacedSheetPiece, 'yIn' | 'heightIn'>>,
  remaining: T[],
  area: ManualArtArea,
) {
  const lowest = placed.reduce((max, piece) => Math.max(max, piece.yIn + piece.heightIn + area.minGapIn), area.top)
  return packSheetBestGutter(remaining, {
    packWidthIn: area.right - area.left,
    sideInsetIn: area.left,
    startYIn: lowest,
    packHeightIn: area.bottom,
    minGutterIn: area.minGapIn,
  })
}

/**
 * One sheet in the same shape `paginateGangSheet` returns, built from hand-placed
 * pieces. Billed like the automatic builder: by how far down the art reaches,
 * snapped up to the next tier — never by the working length alone.
 */
export function manualSheetPage<T extends PackItem & PlacedSheetPiece>(
  pieces: T[],
  opts: ManualSheetOptions & { trailingGapIn?: number },
): SheetPage<T> {
  const area = manualArtArea(opts)
  const startY = area.top
  const gapIn = opts.trailingGapIn ?? area.minGapIn
  const contentBottom = pieces.reduce((max, piece) => Math.max(max, piece.yIn + piece.heightIn), startY)
  const contentEndY = contentBottom + (pieces.length ? gapIn : 0)
  const printedHeightIn = Math.max(0, contentEndY - startY)
  const printHeight = contentEndY + startY
  const tier = sheetTierForArtLength(printedHeightIn, opts.ladder)
  const geometry: PlacedSheetPiece[] = pieces.map((piece) => ({ ...piece, previewUrl: piece.previewUrl ?? '' }))
  const marks = opts.cutOut ? registrationMarkRects(printHeight, opts.sheetWidthIn, geometry) : []
  const markBounds = opts.cutOut ? registrationMarkBounds(printHeight, opts.sheetWidthIn, geometry) : []
  const first = markBounds.find((mark) => mark.first)
  return {
    index: 0,
    layout: {
      pieces: pieces as T[] & PlacedSheetPiece[],
      unplaced: [],
      contentBottom,
      contentEndY,
      gutterIn: gapIn,
      rotatedCount: pieces.filter((piece) => piece.rotated).length,
    } as SheetPage<T>['layout'],
    billableHeightIn: printedHeightIn,
    printedHeightIn,
    printHeight,
    billedLength: tier.length,
    price: tier.price,
    label: sheetLabel(tier.length, opts.labelWidthIn),
    transfers: pieces.length,
    marks,
    markBounds,
    startArrow: first ? startMarkArrowPoints(first) : [],
    cutBoxes: opts.cutOut ? cutPreviewBoxes(geometry, opts.sheetWidthIn, printHeight) : [],
    cutTooTall: opts.cutOut && pieces.some((piece) => piece.heightIn + CUT_MARGIN_IN * 2 > MARK_SECTION_IN),
  }
}

type Rect = { xIn: number; yIn: number; widthIn: number; heightIn: number }

const fitsArea = (rect: Rect, area: ManualArtArea) =>
  rect.xIn >= area.left - EPS && rect.yIn >= area.top - EPS &&
  rect.xIn + rect.widthIn <= area.right + EPS && rect.yIn + rect.heightIn <= area.bottom + EPS

/**
 * Keep a piece inside the printable area (the black frame in the editor).
 * `hit` is true when the requested spot had to be pulled back.
 */
export function clampToArea(rect: Rect, area: ManualArtArea) {
  const xIn = Math.min(area.right - rect.widthIn, Math.max(area.left, rect.xIn))
  const yIn = Math.min(area.bottom - rect.heightIn, Math.max(area.top, rect.yIn))
  return { xIn, yIn, hit: Math.abs(xIn - rect.xIn) > EPS || Math.abs(yIn - rect.yIn) > EPS }
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const MIN_PIECE_IN = 0.5
const RESIZE_STEP_IN = 1 / 8

/**
 * Scale a placed piece by `factor`, proportions locked. The handle decides what
 * stays put: dragging a corner keeps the opposite corner, a side keeps the
 * opposite side (centred along it). The width snaps to ⅛ in, the smaller side
 * never drops under ½ in, and the piece is shrunk back until it fits the area.
 * `start` is the placed rectangle at `startScale`.
 */
export function scaleWithin(start: Rect, startScale: number, factor: number, handle: ResizeHandle, area: ManualArtArea) {
  const baseW = start.widthIn / startScale
  const baseH = start.heightIn / startScale
  const minW = MIN_PIECE_IN * Math.max(1, baseW / baseH)
  const snapW = (value: number) => Math.round(value / RESIZE_STEP_IN) * RESIZE_STEP_IN
  let widthIn = Math.max(minW, snapW(start.widthIn * Math.max(0, factor)))
  let hit = false
  const place = (w: number): Rect => {
    const h = baseH * (w / baseW)
    const fromRight = handle.includes('w')
    const fromBottom = handle.includes('n')
    const xIn = fromRight ? start.xIn + start.widthIn - w : handle === 'n' || handle === 's' ? start.xIn + (start.widthIn - w) / 2 : start.xIn
    const yIn = fromBottom ? start.yIn + start.heightIn - h : handle === 'e' || handle === 'w' ? start.yIn + (start.heightIn - h) / 2 : start.yIn
    return { xIn, yIn, widthIn: w, heightIn: h }
  }
  let rect = place(widthIn)
  while (!fitsArea(rect, area) && widthIn - RESIZE_STEP_IN >= minW - EPS) {
    // Growing into the frame: stop at it (shrink back a step) instead of sliding away.
    widthIn -= RESIZE_STEP_IN
    hit = true
    rect = place(widthIn)
  }
  const clamped = clampToArea(rect, area)
  return { xIn: clamped.xIn, yIn: clamped.yIn, scale: startScale * (rect.widthIn / start.widthIn), widthIn: rect.widthIn, heightIn: rect.heightIn, hit: hit || clamped.hit }
}

/** How far a resize handle has been dragged, as a scale factor of the start size. */
export function resizeFactor(start: Rect, handle: ResizeHandle, pointer: { xIn: number; yIn: number }) {
  const sx = handle.includes('e') ? (pointer.xIn - start.xIn) / start.widthIn
    : handle.includes('w') ? (start.xIn + start.widthIn - pointer.xIn) / start.widthIn : null
  const sy = handle.includes('s') ? (pointer.yIn - start.yIn) / start.heightIn
    : handle.includes('n') ? (start.yIn + start.heightIn - pointer.yIn) / start.heightIn : null
  return sx !== null && sy !== null ? Math.max(sx, sy) : (sx ?? sy ?? 1)
}
