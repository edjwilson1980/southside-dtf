/**
 * Print & Press pricing checks: the ladder, the per-tier math from the price
 * sheet, personalized names, design demand, and the add-to-cart gate.
 */
import assert from 'node:assert/strict'
import { loadLib } from './load-lib.mjs'

const pp = await loadLib('lib/print-press.ts')

const line = (patch) => pp.newPrintPressLine(patch.id ?? 1, patch)

// Price sheet: 50 shirts front + back, all personalized → $100 + $50 + $25 = $175.
{
  const lines = [line({ location: 'both', sizes: { ...pp.emptyPrintPressSizes(), M: '50' }, names: '50', frontDesign: 1, backDesign: 2 })]
  const t = pp.printPressTotals(lines, true)
  assert.equal(t.garments, 50)
  assert.equal(t.tier.label, '21–99')
  assert.equal(t.firstPress, 100)
  assert.equal(t.secondPress, 50)
  assert.equal(t.nameFee, 25)
  assert.equal(t.labor, 175)
  // Names off → the name fee disappears even with a count typed in.
  assert.equal(pp.printPressTotals(lines, false).labor, 150)
}

// Tier boundaries.
for (const [garments, label, first, second] of [
  [1, '1–10', 10, 2],
  [10, '1–10', 10, 2],
  [11, '11–20', 5, 1.5],
  [20, '11–20', 5, 1.5],
  [21, '21–99', 2, 1],
  [99, '21–99', 2, 1],
  [100, '100+', 1.5, 0.75],
  [500, '100+', 1.5, 0.75],
]) {
  const tier = pp.printPressTierFor(garments)
  assert.equal(tier.label, label, `${garments} garments`)
  assert.equal(tier.firstSide, first)
  assert.equal(tier.secondSide, second)
}

// The whole job sets the tier: 50 tees + 12 hoodies = 62 garments at $2 / +$1.
{
  const lines = [
    line({ id: 1, location: 'both', sizes: { ...pp.emptyPrintPressSizes(), S: '5', M: '15', L: '20', XL: '10' }, names: '50', frontDesign: 1, backDesign: 2 }),
    line({ id: 2, garment: 'hoodie', color: 'Navy', location: 'front', sizes: { ...pp.emptyPrintPressSizes(), M: '4', L: '6', XL: '2' }, frontDesign: 3 }),
  ]
  const t = pp.printPressTotals(lines, true)
  assert.equal(t.garments, 62)
  assert.equal(t.doublePress, 50)
  assert.equal(t.personalized, 50)
  assert.equal(t.labor, 124 + 50 + 25)
  // Transfers each design must supply.
  const demand = pp.printPressDesignDemand(lines)
  assert.equal(demand.get(1), 50)
  assert.equal(demand.get(2), 50)
  assert.equal(demand.get(3), 12)
  assert.equal(pp.printPressProblem(lines, true, [1, 2, 3]), null)
  // A removed design is caught.
  assert.match(pp.printPressProblem(lines, true, [1, 2]), /removed/)
  // Cart summary uses design numbers and keeps the math.
  const summary = pp.printPressCartSummary(lines, true, (id) => ({ number: id * 10, name: `D${id}` }))
  assert.equal(summary.labor, 199)
  assert.equal(summary.lines[0].frontDesign, 10)
  assert.equal(summary.lines[0].backDesign, 20)
  assert.equal(summary.lines[1].backDesign, null)
  assert.equal(summary.lines[0].sizes.M, 15)
  assert.equal(pp.printPressSummaryText(summary), '62 garments × $2.00 + 50 second side × $1.00 + 50 names × $0.50 = $199.00')
}

// Roster beats the typed count, capped at the garments on the line.
{
  const l = line({ location: 'front', sizes: { ...pp.emptyPrintPressSizes(), L: '3' }, names: '99', roster: 'JONES\nSMITH\n\nGARCIA\nLEE', frontDesign: 1 })
  assert.equal(pp.linePersonalized(l), 3)
  assert.deepEqual(pp.rosterNames(l), ['JONES', 'SMITH', 'GARCIA', 'LEE'])
}

// Gate: empty slots and empty lines block Add to Cart.
{
  assert.match(pp.printPressProblem([line({})], false, []), /at least one/)
  assert.match(pp.printPressProblem([line({ sizes: { ...pp.emptyPrintPressSizes(), M: '2' } })], false, [1]), /image slot/)
  assert.match(
    pp.printPressProblem([line({ id: 1, sizes: { ...pp.emptyPrintPressSizes(), M: '2' }, frontDesign: 1 }), line({ id: 2 })], false, [1]),
    /no garments/,
  )
}

console.log('verify-print-press: ok')
