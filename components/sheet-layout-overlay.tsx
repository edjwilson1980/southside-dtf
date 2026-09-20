export type LayoutPiece = {
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
}

type SheetLayoutOverlayProps = {
  pieces: LayoutPiece[]
  sheetWidthIn: number
  sheetHeightIn: number
}

/** Black outline of the film edge and every placed design — draw-only. */
export function SheetLayoutOverlay({ pieces, sheetWidthIn, sheetHeightIn }: SheetLayoutOverlayProps) {
  if (sheetWidthIn <= 0 || sheetHeightIn <= 0) return null

  return (
    <div className="sheet-layout-overlay" aria-hidden="true">
      <div className="sheet-edge-box" />
      {pieces.map((piece, index) => (
        <div
          key={`piece-${index}`}
          className="sheet-piece-box"
          style={{
            left: `${(piece.xIn / sheetWidthIn) * 100}%`,
            top: `${(piece.yIn / sheetHeightIn) * 100}%`,
            width: `${(piece.widthIn / sheetWidthIn) * 100}%`,
            height: `${(piece.heightIn / sheetHeightIn) * 100}%`,
          }}
        />
      ))}
    </div>
  )
}
