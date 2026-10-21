'use client'

import { Plus, Shirt, Trash2 } from 'lucide-react'
import {
  LEFT_CHEST_MAX_WIDTH_IN,
  PRINT_PRESS_COLORS,
  PRINT_PRESS_GARMENTS,
  PRINT_PRESS_LOCATIONS,
  PRINT_PRESS_NAME_FEE,
  PRINT_PRESS_SIZES,
  PRINT_PRESS_TIERS,
  lineFrontIsChest,
  lineGarments,
  lineNeedsBack,
  lineNeedsFront,
  money,
  newPrintPressLine,
  printPressFrontLabel,
  printPressGarmentLabel,
  printPressLocationLabel,
  rosterNames,
  toCount,
  type PrintPressLine,
  type PrintPressLocation,
  type PrintPressSize,
  type PrintPressTotals,
} from '@/lib/print-press'

export type PrintPressDesignOption = {
  id: number
  number: number
  name: string
  previewUrl: string
  sizeLabel: string
  /** Printed width, used to nudge oversized art out of the left chest slot. */
  widthIn?: number
}

type Props = {
  enabled: boolean
  onToggle: (next: boolean) => void
  namesOn: boolean
  onNamesChange: (next: boolean) => void
  lines: PrintPressLine[]
  onLinesChange: (update: (lines: PrintPressLine[]) => PrintPressLine[]) => void
  designs: PrintPressDesignOption[]
  totals: PrintPressTotals
  /** Transfers each design must supply, by design id. */
  demand: Map<number, number>
  problem: string | null
}

function DesignSlot({
  side,
  chest = false,
  designs,
  value,
  onChange,
}: {
  side: 'Front' | 'Left chest' | 'Back'
  /** Left chest logo slot: small art expected, big art gets a hint. */
  chest?: boolean
  designs: PrintPressDesignOption[]
  value: number | null
  onChange: (id: number | null) => void
}) {
  const design = designs.find((item) => item.id === value)
  const tooWide = chest && design?.widthIn != null && design.widthIn > LEFT_CHEST_MAX_WIDTH_IN
  return (
    <div className={`pp-slot${design ? '' : ' missing'}${chest ? ' chest' : ''}`}>
      <span className={`pp-slot-thumb${design ? ' has-art' : ''}`}>
        {design ? <img src={design.previewUrl} alt="" /> : <span>none</span>}
        {design && <i className="pp-cut-line" aria-hidden="true" />}
      </span>
      <label>
        {side} image
        <select
          aria-label={`${side} image`}
          value={value === null ? '' : String(value)}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        >
          <option value="">Choose a design…</option>
          {designs.map((item) => (
            <option key={item.id} value={String(item.id)}>
              #{item.number} {item.name} · {item.sizeLabel}
            </option>
          ))}
        </select>
        {!design && <small>Required — which design goes on the {side.toLowerCase()}?</small>}
        {design && chest && !tooWide && <small>Logo prints on the left chest, about 3–4 in wide.</small>}
        {tooWide && (
          <small className="pp-slot-warn">
            This design is {design.sizeLabel} — wide for a left chest logo. Set it to a Left Chest size in step 2 (3–4.5 in) or choose another design.
          </small>
        )}
      </label>
    </div>
  )
}

export function PrintPressPanel({ enabled, onToggle, namesOn, onNamesChange, lines, onLinesChange, designs, totals, demand, problem }: Props) {
  const updateLine = (id: number, patch: Partial<PrintPressLine>) =>
    onLinesChange((items) => items.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  const updateSize = (id: number, size: PrintPressSize, value: string) =>
    onLinesChange((items) =>
      items.map((line) => (line.id === id ? { ...line, sizes: { ...line.sizes, [size]: value.replace(/[^0-9]/g, '').slice(0, 4) } } : line)),
    )
  const addLine = () =>
    onLinesChange((items) => [
      ...items,
      newPrintPressLine((items[items.length - 1]?.id ?? 0) + 1, { color: items.length ? 'White' : 'Black' }),
    ])
  const removeLine = (id: number) => onLinesChange((items) => (items.length > 1 ? items.filter((line) => line.id !== id) : items))

  return (
    <section className={`pp-panel${enabled ? ' on' : ''}`} aria-label="Print & Press add-on">
      <div className="pp-head">
        <div>
          <span className="eyebrow">Add-on</span>
          <h2>Add Print &amp; Press</h2>
          <p>
            We press your transfers onto your garments. <b>Front only from {money(1.5)} each</b> — add a back print for as
            little as {money(0.75)} more. Pre-cutting is included.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className={`pp-switch${enabled ? ' on' : ''}`}
          onClick={() => onToggle(!enabled)}
        >
          <span />
          <span className="sr-only">{enabled ? 'Remove Print & Press' : 'Add Print & Press'}</span>
        </button>
      </div>

      {enabled && (
        <>
          <div className="pp-ladder" aria-label="Print & Press prices">
            <table>
              <thead>
                <tr>
                  <th>Garments</th>
                  <th>Front or back</th>
                  <th>Add 2nd side</th>
                  <th>Front + back</th>
                </tr>
              </thead>
              <tbody>
                {PRINT_PRESS_TIERS.map((tier) => (
                  <tr key={tier.label} className={totals.garments > 0 && tier === totals.tier ? 'current' : ''}>
                    <td>{tier.label}</td>
                    <td>{money(tier.firstSide)}</td>
                    <td>+{money(tier.secondSide)}</td>
                    <td>{money(tier.firstSide + tier.secondSide)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pp-step">
            <strong>Personalized names</strong>
            <div className="pp-choice-row">
              <button type="button" className={`pp-choice${!namesOn ? ' selected' : ''}`} onClick={() => onNamesChange(false)}>
                No
              </button>
              <button type="button" className={`pp-choice${namesOn ? ' selected' : ''}`} onClick={() => onNamesChange(true)}>
                Yes <small>+{money(PRINT_PRESS_NAME_FEE)} per personalized garment</small>
              </button>
            </div>
            {namesOn && (
              <p className="pp-hint">
                Paste the names for each line below (one per row) or just enter a count. Upload the name artwork as designs
                and assign it, or we will typeset the names from your list. The list prints on the press sheet so we match
                each name to its shirt.
              </p>
            )}
          </div>

          <div className="pp-step">
            <strong>Your garments — what goes where</strong>
            <p className="pp-hint">You supply the shirts. One line per garment, color and print location. Your designs above are the images we press.</p>
            {designs.length === 0 && <p className="pp-warn">Upload your designs in step 2 first, then pick which one goes on the front and back.</p>}

            {lines.map((line, index) => {
              const total = lineGarments(line)
              const roster = rosterNames(line)
              return (
                <div className="pp-line" key={line.id}>
                  <div className="pp-line-head">
                    <span className="pp-line-num">{index + 1}</span>
                    <strong>
                      {printPressGarmentLabel(line.garment)} · {line.color} · {printPressLocationLabel(line.location)}
                    </strong>
                    <span className="pp-line-total">
                      <b>{total}</b> garment{total === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      className="row-action danger"
                      title="Remove line"
                      aria-label={`Remove Print & Press line ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() => removeLine(line.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="pp-grid-scroll">
                    <div className={`pp-grid${namesOn ? ' with-names' : ''}`}>
                      <span className="pp-col">Garment</span>
                      <span className="pp-col">Color</span>
                      <span className="pp-col">Print on</span>
                      {PRINT_PRESS_SIZES.map((size) => (
                        <span key={size} className="pp-col center">
                          {size}
                        </span>
                      ))}
                      {namesOn && <span className="pp-col center">Names</span>}

                      <select aria-label="Garment" value={line.garment} onChange={(event) => updateLine(line.id, { garment: event.target.value })}>
                        {PRINT_PRESS_GARMENTS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <select aria-label="Garment color" value={line.color} onChange={(event) => updateLine(line.id, { color: event.target.value })}>
                        {PRINT_PRESS_COLORS.map((color) => (
                          <option key={color} value={color}>
                            {color}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Print location"
                        value={line.location}
                        onChange={(event) => updateLine(line.id, { location: event.target.value as PrintPressLocation })}
                      >
                        {PRINT_PRESS_LOCATIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      {PRINT_PRESS_SIZES.map((size) => (
                        <input
                          key={size}
                          aria-label={`${size} quantity`}
                          inputMode="numeric"
                          placeholder="0"
                          value={line.sizes[size]}
                          onChange={(event) => updateSize(line.id, size, event.target.value)}
                        />
                      ))}
                      {namesOn && (
                        <input
                          aria-label="Personalized garments on this line"
                          inputMode="numeric"
                          placeholder="0"
                          disabled={roster.length > 0}
                          className={toCount(line.names) > total ? 'over' : ''}
                          value={roster.length ? String(Math.min(total, roster.length)) : line.names}
                          onChange={(event) => updateLine(line.id, { names: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
                        />
                      )}
                    </div>
                  </div>

                  <div className="pp-line-body">
                    {lineNeedsFront(line) && (
                      <DesignSlot
                        side={printPressFrontLabel(line.location)}
                        chest={lineFrontIsChest(line)}
                        designs={designs}
                        value={line.frontDesign}
                        onChange={(id) => updateLine(line.id, { frontDesign: id })}
                      />
                    )}
                    {lineNeedsBack(line) && (
                      <DesignSlot side="Back" designs={designs} value={line.backDesign} onChange={(id) => updateLine(line.id, { backDesign: id })} />
                    )}
                    {namesOn && (
                      <label className="pp-roster">
                        Names for this line (one per row)
                        <textarea
                          rows={3}
                          placeholder={'JONES\nSMITH\nGARCIA…'}
                          value={line.roster}
                          onChange={(event) => updateLine(line.id, { roster: event.target.value })}
                        />
                        <small>
                          {roster.length
                            ? `${roster.length} name${roster.length === 1 ? '' : 's'}${roster.length > total ? ` — more than the ${total} garments on this line` : ''}`
                            : 'Optional now; we need the list before we press.'}
                        </small>
                      </label>
                    )}
                  </div>
                </div>
              )
            })}

            <div className="pp-line-actions">
              <button type="button" className="pp-add-line" onClick={addLine}>
                <Plus size={16} /> Add a line
              </button>
              <span className="pp-hint">
                <b>{totals.garments}</b> garment{totals.garments === 1 ? '' : 's'} · tier {totals.tier.label} · {money(totals.tier.firstSide)} first side, +
                {money(totals.tier.secondSide)} second side
              </span>
            </div>
          </div>

          {demand.size > 0 && (
            <div className="pp-demand">
              <strong>
                <Shirt size={15} /> Transfers set by your garments
              </strong>
              <ul>
                {designs
                  .filter((design) => (demand.get(design.id) ?? 0) > 0)
                  .map((design) => (
                    <li key={design.id}>
                      #{design.number} {design.name} <b>× {demand.get(design.id)}</b>
                    </li>
                  ))}
              </ul>
              <small>Design quantities follow the garment counts above so the gang sheet, the cut files and the press sheet always agree.</small>
            </div>
          )}

          <div className="pp-total">
            <div>
              <span>Print &amp; Press labor</span>
              <small>
                {[
                  `${totals.garments} × ${money(totals.tier.firstSide)}`,
                  totals.doublePress > 0 ? `${totals.doublePress} × ${money(totals.tier.secondSide)}` : '',
                  totals.personalized > 0 ? `${totals.personalized} names × ${money(PRINT_PRESS_NAME_FEE)}` : '',
                ]
                  .filter(Boolean)
                  .join(' + ')}
                {' · pre-cut included'}
              </small>
            </div>
            <strong>{money(totals.labor)}</strong>
          </div>

          {problem && <p className="pp-warn">{problem}</p>}

          <p className="pp-fine">
            Print &amp; Press is available exclusively with transfers purchased from South Side DTF. Customer supplies garments.
            Front, left chest logo and back only — sleeves, hats and other specialty locations are not available. A left chest logo counts as the front print. Personalized name placement is +{money(PRINT_PRESS_NAME_FEE)} per garment.
            Every transfer is pre-cut.
          </p>
        </>
      )}
    </section>
  )
}
