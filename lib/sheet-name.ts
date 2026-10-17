/**
 * "M/D HHMM" job stamp. Browsers use their own clock; the server passes the
 * shop's time zone (servers run on UTC).
 */
export function sheetStamp(at = new Date(), timeZone?: string) {
  if (timeZone) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(at)
        .map((part) => [part.type, part.value]),
    )
    return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour.padStart(2, '0')}${parts.minute.padStart(2, '0')}`
  }
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

/**
 * Which sheet of the job this is. Multi-sheet jobs print "1 of 3", "2 of 3"…
 * on the label and in every file name so the press and cutter stay matched.
 * A legacy number is treated as a copy count (`… 2`).
 */
export type SheetPart = { index: number; count: number } | number

function partSuffix(part?: SheetPart) {
  if (part === undefined) return ''
  if (typeof part === 'number') return part > 1 ? ` ${part}` : ''
  if (!(part.count > 1)) return ''
  return ` ${part.index + 1} of ${part.count}`
}

export function sheetJobName(
  customerName: string,
  billedLengthIn: number,
  stamp = sheetStamp(),
  part?: SheetPart,
) {
  const who = safeName(customerName, 'Customer')
  const length = `${Math.max(12, Math.round(billedLengthIn))}`
  return `${who} ${stamp}     (${length})${partSuffix(part)}`
}

function fileSafe(name: string) {
  return name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sheetFileName(
  customerName: string,
  billedLengthIn: number,
  stamp = sheetStamp(),
  part?: SheetPart,
) {
  return `${fileSafe(sheetJobName(customerName, billedLengthIn, stamp, part))}.png`
}

export function sheetCutFileName(
  customerName: string,
  billedLengthIn: number,
  stamp = sheetStamp(),
  part?: SheetPart,
) {
  return `${fileSafe(sheetJobName(customerName, billedLengthIn, stamp, part))} cut.plt`
}
