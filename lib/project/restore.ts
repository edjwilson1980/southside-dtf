import type { ProjectImageRef } from './types'
import { resolveProjectImageUrls } from './images'

export type RestoredDesignSeed = {
  id: number
  designNumber: number
  name: string
  placement: string
  size: string
  customWidth: string
  customHeight: string
  quantity: number
  notes: string
  color: string
  originalUrl: string
  previewUrl: string
  enhanced: boolean
  pixelWidth: number
  pixelHeight: number
  keepUpright: boolean
  /** True when art could not be loaded — staff should re-upload this slot. */
  needsReupload: boolean
}

export type RestoreDesignOptions = {
  placements: string[]
  sizeOptions: Record<string, string[]>
  recommendedSize: (placement: string) => string
  /** Force every design onto this placement (sticker maker). */
  forcePlacement?: string
  defaultCustomWidth?: string
  defaultCustomHeight?: string
}

function dimsFromSizeLabel(size: string): { w: number; h: number } | null {
  const nums = [...size.matchAll(/[0-9]+(?:\.[0-9]+)?/g)].map((match) => Number(match[0]))
  if (nums.length >= 2 && nums[0] > 0 && nums[1] > 0) return { w: nums[0], h: nums[1] }
  if (nums.length === 1 && nums[0] > 0) return { w: nums[0], h: nums[0] }
  return null
}

function closestSizeOption(
  options: string[],
  target: { w: number; h: number },
): string | null {
  let best: string | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const option of options) {
    const dims = dimsFromSizeLabel(option)
    if (!dims) continue
    const score = Math.abs(dims.w - target.w) + Math.abs(dims.h - target.h)
    if (score < bestScore) {
      bestScore = score
      best = option
    }
  }
  return bestScore <= 0.6 ? best : null
}

/**
 * Map a saved image row onto a placement + size the builder UI can edit.
 * Prefers exact size labels; falls back to sizeIn; then Custom dims.
 */
export function coercePlacementAndSize(
  image: ProjectImageRef,
  options: RestoreDesignOptions,
): Pick<RestoredDesignSeed, 'placement' | 'size' | 'customWidth' | 'customHeight'> {
  if (options.forcePlacement) {
    const width =
      image.customWidth ||
      (image.sizeIn?.w != null ? String(image.sizeIn.w) : options.defaultCustomWidth || '')
    const height =
      image.customHeight ||
      (image.sizeIn?.h != null ? String(image.sizeIn.h) : options.defaultCustomHeight || '')
    return {
      placement: options.forcePlacement,
      size: image.size || (width && height ? `${width} × ${height} in` : options.recommendedSize(options.forcePlacement)),
      customWidth: width,
      customHeight: height,
    }
  }

  const placement =
    image.placement && options.placements.includes(image.placement)
      ? image.placement
      : image.sizeIn?.w || image.customWidth
        ? 'Custom'
        : 'Adult Shirt'

  const optionList = options.sizeOptions[placement] || options.sizeOptions.default || []

  if (placement === 'Custom') {
    const width =
      image.customWidth || (image.sizeIn?.w != null ? String(image.sizeIn.w) : '')
    const height =
      image.customHeight || (image.sizeIn?.h != null ? String(image.sizeIn.h) : '')
    return {
      placement,
      size: image.size || `${width || '0'} × ${height || '0'} in`,
      customWidth: width,
      customHeight: height,
    }
  }

  if (image.size && optionList.includes(image.size)) {
    return {
      placement,
      size: image.size,
      customWidth: image.customWidth || '',
      customHeight: image.customHeight || '',
    }
  }

  const fromSizeIn =
    image.sizeIn?.w != null && image.sizeIn?.h != null
      ? { w: Number(image.sizeIn.w), h: Number(image.sizeIn.h) }
      : dimsFromSizeLabel(image.size || '')

  if (fromSizeIn) {
    const match = closestSizeOption(optionList, fromSizeIn)
    if (match) {
      return { placement, size: match, customWidth: '', customHeight: '' }
    }
    // No close garment size — keep editable Custom dims so resize still works.
    return {
      placement: 'Custom',
      size: `${fromSizeIn.w} × ${fromSizeIn.h} in`,
      customWidth: String(fromSizeIn.w),
      customHeight: String(fromSizeIn.h),
    }
  }

  return {
    placement,
    size: options.recommendedSize(placement),
    customWidth: '',
    customHeight: '',
  }
}

/** Rebuild editable design rows from a project JSON (SPEC B5.1). */
export async function restoreDesignsFromProject(
  images: ProjectImageRef[] | undefined,
  options: RestoreDesignOptions,
): Promise<{ designs: RestoredDesignSeed[]; missingArtCount: number }> {
  const imageUrls = await resolveProjectImageUrls(images)
  const designs: RestoredDesignSeed[] = (images || []).map((image, index) => {
    const url = imageUrls[index] || ''
    const coerced = coercePlacementAndSize(image, options)
    return {
      id: typeof image.id === 'number' ? image.id : Date.now() + index,
      designNumber: index + 1,
      name: image.name || image.fileName || `Design ${index + 1}`,
      ...coerced,
      quantity: Math.max(1, image.quantity || 1),
      notes: '',
      color: index % 2 ? 'red' : 'blue',
      originalUrl: url,
      previewUrl: url,
      enhanced: false,
      pixelWidth: image.pixelWidth || image.original?.pxW || image.processed?.pxW || 0,
      pixelHeight: image.pixelHeight || image.original?.pxH || image.processed?.pxH || 0,
      keepUpright: Boolean(image.keepUpright),
      needsReupload: !url,
    }
  })
  return {
    designs,
    missingArtCount: designs.filter((design) => design.needsReupload).length,
  }
}
