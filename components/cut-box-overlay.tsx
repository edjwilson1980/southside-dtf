import { startMarkArrowPoints, type CutBox } from '@/lib/cut-layout'

type CutBoxOverlayProps = {
  boxes: CutBox[]
  marks?: Array<CutBox & { first?: boolean }>
  sheetWidthIn: number
  sheetHeightIn: number
}

export function CutBoxOverlay({
  boxes,
  marks = [],
  sheetWidthIn,
  sheetHeightIn,
}: CutBoxOverlayProps) {
  if (sheetWidthIn <= 0 || sheetHeightIn <= 0 || (boxes.length === 0 && marks.length === 0)) return null

  return (
    <div className="cut-overlay" aria-hidden="true">
      {boxes.map((box, index) => (
        <div
          key={`box-${index}`}
          className="cut-preview-box"
          style={{
            left: `${(box.xIn / sheetWidthIn) * 100}%`,
            top: `${(box.yIn / sheetHeightIn) * 100}%`,
            width: `${(box.widthIn / sheetWidthIn) * 100}%`,
            height: `${(box.heightIn / sheetHeightIn) * 100}%`,
          }}
        />
      ))}
      {marks.length > 0 && (
        <svg
          className="cut-overlay-svg"
          viewBox={`0 0 ${sheetWidthIn} ${sheetHeightIn}`}
          preserveAspectRatio="none"
        >
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
          {marks.filter((mark) => mark.first).map((mark, index) => {
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
      )}
    </div>
  )
}
