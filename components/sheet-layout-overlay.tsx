export type LayoutPiece = {
  designId: number
  copyIndex: number
  name: string
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
  rotated?: boolean
}

export function pieceKey(piece: { designId: number; copyIndex: number }): string {
  return `${piece.designId}:${piece.copyIndex}`
}

type SheetLayoutOverlayProps = {
  pieces: LayoutPiece[]
  sheetWidthIn: number
  sheetHeightIn: number
  selectable?: boolean
  selectedKey?: string | null
  onSelect?: (piece: LayoutPiece) => void
}

export function SheetLayoutOverlay({
  pieces,
  sheetWidthIn,
  sheetHeightIn,
  selectable = false,
  selectedKey = null,
  onSelect,
}: SheetLayoutOverlayProps) {
  if (sheetWidthIn <= 0 || sheetHeightIn <= 0) return null

  return (
    <div className="sheet-layout-overlay" aria-hidden={!selectable}>
      <div className="sheet-edge-box" />
      {pieces.map((piece) => {
        const key = pieceKey(piece)
        const selected = selectedKey === key
        const style = {
          left: `${(piece.xIn / sheetWidthIn) * 100}%`,
          top: `${(piece.yIn / sheetHeightIn) * 100}%`,
          width: `${(piece.widthIn / sheetWidthIn) * 100}%`,
          height: `${(piece.heightIn / sheetHeightIn) * 100}%`,
        }
        if (!selectable) {
          return <div key={key} className="sheet-piece-box" style={style} />
        }
        return (
          <button
            key={key}
            type="button"
            className={`sheet-piece-box selectable${selected ? ' selected' : ''}`}
            style={style}
            aria-label={`${piece.name}${piece.rotated ? ' (turned)' : ''}`}
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation()
              onSelect?.(piece)
            }}
          />
        )
      })}
    </div>
  )
}
