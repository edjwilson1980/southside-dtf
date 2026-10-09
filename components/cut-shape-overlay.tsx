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
