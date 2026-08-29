export function sheetStamp(at = new Date()) {
  const time = `${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}`
  return `${at.getMonth() + 1}/${at.getDate()} ${time}`
}

function safeName(value: string, fallback: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

export function sheetJobName(
  customerName: string,
  billedLengthIn: number,
  stamp = sheetStamp(),
  copy = 1,
) {
  const who = safeName(customerName, 'Customer')
  const length = `${Math.max(12, Math.round(billedLengthIn))}`
  const base = `${who} ${stamp}     (${length})`
  return copy > 1 ? `${base} ${copy}` : base
}

export function sheetFileName(
  customerName: string,
  billedLengthIn: number,
  stamp = sheetStamp(),
  copy = 1,
) {
  const name = sheetJobName(customerName, billedLengthIn, stamp, copy)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return `${name}.png`
}

export function sheetCutFileName(
  customerName: string,
  billedLengthIn: number,
  stamp = sheetStamp(),
) {
  const name = sheetJobName(customerName, billedLengthIn, stamp)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return `${name} cut.plt`
}
