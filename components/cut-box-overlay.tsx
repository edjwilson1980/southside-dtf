import { CUT_SECTION_IN, type CutBox } from '@/lib/cut-layout'

type CutBoxOverlayProps = {
  boxes: CutBox[]
  marks?: Array<CutBox & { first?: boolean }>
  sheetWidthIn: number
  sheetHeightIn: number
  showSections?: boolean
}

export function CutBoxOverlay({
  boxes,
  marks = [],
  sheetWidthIn,
  sheetHeightIn,
  showSections = true,
}: CutBoxOverlayProps) {
  if (sheetWidthIn <= 0 || sheetHeightIn <= 0 || (boxes.length === 0 && marks.length === 0)) return null
  const sectionCount = Math.max(0, Math.floor((sheetHeightIn - 1e-6) / CUT_SECTION_IN))

  return (
    <div className="cut-overlay" aria-hidden="true">
      {showSections && Array.from({ length: sectionCount }, (_, index) => (
        <div
          key={`section-${index}`}
          className="cut-section-line"
          style={{ top: `${(((index + 1) * CUT_SECTION_IN) / sheetHeightIn) * 100}%` }}
        />
      ))}
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
      {marks.map((mark, index) => (
        <div
          key={`mark-${index}`}
          className={`cut-reg-mark ${mark.first ? 'first' : ''}`}
          style={{
            left: `${(mark.xIn / sheetWidthIn) * 100}%`,
            top: `${(mark.yIn / sheetHeightIn) * 100}%`,
            width: `${(mark.widthIn / sheetWidthIn) * 100}%`,
            aspectRatio: '1',
            height: 'auto',
          }}
        />
      ))}
    </div>
  )
}
