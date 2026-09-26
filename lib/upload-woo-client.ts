'use client'

import {
  pickUploadSize,
  type UploadSizeOption,
} from '@/lib/upload-pricing'

export async function fetchUploadSizes(): Promise<UploadSizeOption[]> {
  // Same-origin proxy → Woo REST (prices never hardcoded here).
  const res = await fetch('/api/upload/sizes', { credentials: 'omit' })
  const json = (await res.json()) as { sizes?: UploadSizeOption[]; error?: string }
  if (!res.ok) {
    throw new Error(json.error || 'Could not load Upload Gangsheet prices from the store.')
  }
  if (!Array.isArray(json.sizes) || json.sizes.length === 0) {
    throw new Error(json.error || 'No Upload Gangsheet sizes are available.')
  }
  return json.sizes
}

export function matchUploadSize(lengthIn: number, sizes: UploadSizeOption[]) {
  return pickUploadSize(lengthIn, sizes)
}
