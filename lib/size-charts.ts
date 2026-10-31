/**
 * Size charts for the customer builder: the "What are you printing?" cards,
 * each card's size menu, and the size guide picture. Size labels end in
 * "W × H in" (or "W in"); the packer reads the numbers after the last " · ".
 */
export type SizeChart = {
  /** Cards in step 3. `Custom` opens the width × height fields. */
  placements: string[]
  /** Size menu per card; `default` covers anything not listed. */
  sizes: Record<string, string[]> & { default: string[] }
  /** Size a new upload starts on, per card. */
  recommended: Record<string, string>
  /** Starting size for a card with no `recommended` entry. */
  fallbackSize: string
  defaultPlacement: string
  /** Card tagged POPULAR. */
  popular: string
  guideImageUrl: string
  guideImageAlt: string
  guideNote: string
  /** Step 3 copy. */
  pickDetail: string
  pickHint: string
}

const CUSTOM_SIZES = ['3 in', '4 in', '5 in', '6 in', '8 in', '10 in', '12 in', '14 in']

export const DTF_SIZE_CHART: SizeChart = {
  placements: ['Left Chest', 'Toddler Shirt', 'Youth Shirt', 'Adult Shirt', 'Hoodie Front', 'Hoodie Back', 'Hat', 'Sleeve', 'Custom'],
  sizes: {
    'Left Chest': ['Youth Left Chest · 3 × 3 in', 'Standard Left Chest · 3.75 × 3.75 in', 'Oversized Left Chest · 4.5 × 4.5 in'],
    'Toddler Shirt': ['2T · 5.5 × 6 in', '3T · 6 × 6.5 in', '4T · 6.5 × 7 in', '5T · 6.5 × 7 in'],
    'Youth Shirt': ['XS · 7.5 × 8 in', 'Small · 8.5 × 9 in', 'Medium · 9.25 × 10 in', 'Large · 9.75 × 11 in'],
    'Adult Shirt': ['Small · 10 × 12 in', 'Medium · 10.5 × 12 in', 'Large · 10.5 × 12 in', 'XL · 10.5 × 12 in', '2XL · 12.5 × 13 in', '3XL · 13.5 × 14 in'],
    'Hoodie Front': [
      'Small · 10.5 × 10 in',
      'Medium · 10.5 × 11 in',
      'Large · 10.5 × 12 in',
      'XL · 10.5 × 12 in',
      '2XL · 12 × 13 in',
      '3XL · 13 × 15 in',
      '4XL · 14 × 15 in',
    ],
    'Hoodie Back': [
      'Small · 10.5 × 12 in',
      'Medium · 10.5 × 12 in',
      'Large · 10.5 × 12 in',
      'XL · 10.5 × 12 in',
      '2XL · 12 × 14 in',
      '3XL · 13 × 15 in',
      '4XL · 14 × 16 in',
    ],
    Hat: ['Small · 3 in', 'Medium · 4 in', 'Large · 5 in'],
    Sleeve: ['3 in', '3.5 in', '4 in', '4.5 in', '5 in'],
    Custom: CUSTOM_SIZES,
    default: ['3 in', '4 in', '5 in', '6 in', '10.5 in', '12 in'],
  },
  recommended: {
    'Left Chest': 'Standard Left Chest · 3.75 × 3.75 in',
    'Youth Shirt': 'Small · 8.5 × 9 in',
    'Toddler Shirt': '4T · 6.5 × 7 in',
    'Adult Shirt': 'Medium · 10.5 × 12 in',
    'Hoodie Front': 'Medium · 10.5 × 11 in',
    'Hoodie Back': 'Medium · 10.5 × 12 in',
    Hat: 'Medium · 4 in',
  },
  fallbackSize: '10.5 in',
  defaultPlacement: 'Adult Shirt',
  popular: 'Adult Shirt',
  guideImageUrl: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/DTF%20size%20chart%20%20front2-SIpj1XrVDRyRDtQhaACxzNHj5geNxv.png',
  guideImageAlt: 'DTF design size guide for toddler, youth, and adult shirts',
  guideNote: 'Pick a garment below to update this chart. Hoodie Front uses the new max width × height sizes.',
  pickDetail: 'Pick the shirt, hoodie, hat, or custom size.',
  pickHint: 'Tap the garment or placement that matches this design.',
}

/**
 * UV DTF decals: one standard size menu plus Custom. Window and Door Sign are the
 * car window and business door sign sizes from the UV DTF size guide.
 */
export const UV_DTF_SIZE_CHART: SizeChart = {
  placements: ['UV DTF Decal', 'Custom'],
  sizes: {
    'UV DTF Decal': [
      'Small · 1.5 × 1.5 in',
      'Small+ · 2 × 2 in',
      'Medium · 3 × 3 in',
      'Medium Tall · 3 × 4 in',
      'Large · 4 × 4 in',
      'Large Wide · 5 × 3 in',
      'XL · 6 × 4 in',
      'Window · 5 × 5 in',
      'Door Sign · 8 × 5 in',
    ],
    Custom: CUSTOM_SIZES,
    default: ['Medium · 3 × 3 in'],
  },
  // Most popular everyday size on the guide.
  recommended: { 'UV DTF Decal': 'Medium · 3 × 3 in' },
  fallbackSize: '3 in',
  defaultPlacement: 'UV DTF Decal',
  popular: 'UV DTF Decal',
  guideImageUrl: '/uv-dtf-size-guide.webp',
  guideImageAlt: 'UV DTF size guide: recommended decal sizes for drinkware, tech, signs, auto, and packaging',
  guideNote: 'Find your item on the guide, then pick that size. Use Custom to type any width × height.',
  pickDetail: 'Pick a standard decal size, or Custom.',
  pickHint: 'Tap UV DTF Decal for the standard sizes, or Custom to set your own width × height.',
}
