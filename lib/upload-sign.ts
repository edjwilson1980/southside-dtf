import { createHmac, timingSafeEqual } from 'crypto'
import {
  formatSignedNumber,
  uploadSignPayload,
  type UploadSignedMeasure,
} from '@/lib/upload-sign-shared'

export { formatSignedNumber, uploadSignPayload, type UploadSignedMeasure }

export function signUploadMeasure(
  secret: string,
  fields: Omit<UploadSignedMeasure, 'sig'>,
): UploadSignedMeasure {
  const payload = uploadSignPayload(fields)
  const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
  return { ...fields, sig }
}

export function verifyUploadMeasure(secret: string, signed: UploadSignedMeasure): boolean {
  if (!secret || !signed?.sig) return false
  const exp = Number(signed.exp)
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const expected = signUploadMeasure(secret, {
    drive_file_id: signed.drive_file_id,
    width_in: signed.width_in,
    length_in: signed.length_in,
    dpi: signed.dpi,
    filename: signed.filename,
    exp: signed.exp,
  }).sig
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(signed.sig, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function uploadSignSecret() {
  return (
    process.env.SSGS_UPLOAD_SIGN_SECRET?.trim() ||
    process.env.SSGS_COMMIT_SECRET?.trim() ||
    process.env.RELAY_SHARED_SECRET?.trim() ||
    ''
  )
}
