import { startMarkArrowPoints, type CutBox } from '@/lib/cut-layout'
import type { CutShape } from '@/lib/custom-cut'

type CutShapeOverlayProps = {
  shapes: CutShape[]
  marks?: Array<CutBox & { first?: boolean }>
  sheetWidthIn: number
  sheetHeightIn: number
}

export function CutShapeOverlay({
  shapes,
  marks = [],
  sheetWidthIn,
  sheetHeightIn,
}: CutShapeOverlayProps) {
  if (sheetWidthIn <= 0 || sheetHeightIn <= 0 || (shapes.length === 0 && marks.length === 0)) return null

  return (
    <div className="cut-overlay" aria-hidden="true">
      <svg
        className="cut-overlay-svg"
        viewBox={`0 0 ${sheetWidthIn} ${sheetHeightIn}`}
        preserveAspectRatio="none"
      >
        {shapes.map((shape, index) => (
          <polygon
            key={`shape-${index}`}
            className={`cut-preview-shape cut-preview-shape-${shape.kind}`}
            points={shape.points.map((point) => `${point.xIn},${point.yIn}`).join(' ')}
          />
        ))}
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
