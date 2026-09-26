/** Client-safe upload sign types (no Node crypto). */

export type UploadSignedMeasure = {
  drive_file_id: string
  width_in: string
  length_in: string
  dpi: string
  filename: string
  exp: string
  sig: string
}

/** Fixed-decimal transport strings so PHP/JS never re-serialize floats differently. */
export function formatSignedNumber(n: number, decimals = 4) {
  return Number(n).toFixed(decimals)
}

export function uploadSignPayload(fields: {
  drive_file_id: string
  width_in: string
  length_in: string
  dpi: string
  filename: string
  exp: string
}) {
  return [
    fields.drive_file_id,
    fields.width_in,
    fields.length_in,
    fields.dpi,
    fields.filename,
    fields.exp,
  ].join('|')
}
