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
  /**
   * Step 3 lists the chosen card's items as numbered buttons (numbers run across
   * the cards in order, matching the size guide picture).
   */
  itemPicker?: boolean
  /** Extra size menu group after each card's own sizes (not on Custom). */
  standardSizes?: string[]
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
 * UV DTF decals by item, in the categories and order of the UV DTF size guide
 * (items 1–30), plus Custom. Every menu also offers the standard decal sizes.
 */
export const UV_DTF_SIZE_CHART: SizeChart = {
  placements: ['Drinkware', 'Tech + Accessories', 'Signs + Auto', 'Storage + Packaging', 'Custom'],
  sizes: {
    Drinkware: [
      '20 oz Skinny Tumbler · 3 × 3 in',
      '30 oz Tumbler · 3.5 × 4 in',
      '40 oz Tumbler · 3.5 × 4.5 in',
      '16 oz Glass Can · 3 × 3.5 in',
      '12 oz Coffee Mug · 3 × 3 in',
      '15 oz Coffee Mug · 3.5 × 3.5 in',
      'Travel Coffee Mug · 3 × 3 in',
      'Water Bottle · 3 × 4 in',
      'Sports Bottle · 3 × 3.5 in',
      'Wine Glass · 2 × 2 in',
      'Stemless Wine Glass · 2.5 × 2.5 in',
      'Champagne Flute · 1.5 × 2.5 in',
      'Shot Glass · 1.25 × 1.25 in',
      'Mason Jar · 2.5 × 3 in',
      'Beer / Pint Glass · 3 × 3 in',
    ],
    'Tech + Accessories': [
      'Acrylic Cup · 3 × 3 in',
      'Plastic Stadium Cup · 3 × 3 in',
      'Phone Case · 2 × 3 in',
      'Laptop · 5 × 3 in',
      'Tablet / iPad Case · 4 × 3 in',
      'Notebook / Journal · 4 × 4 in',
    ],
    'Signs + Auto': [
      'Acrylic Keychain · 1.5 × 1.5 in',
      'Acrylic Sign · 6 × 4 in',
      'Business Door Sign · 8 × 5 in',
      'Car Window Decal · 5 × 5 in',
      'Car Dashboard / Interior Badge · 2 × 1 in',
    ],
    'Storage + Packaging': [
      'Hard-Shell Lunch Box · 4 × 3 in',
      'Storage Container / Bin · 4 × 2 in',
      'Cosmetic / Makeup Container · 2 × 1.5 in',
      'Product Packaging / Rigid Box · 3 × 2 in',
    ],
    Custom: CUSTOM_SIZES,
    default: ['Medium · 3 × 3 in'],
  },
  // Each card starts on its first item; Drinkware's is the popular 3 × 3.
  recommended: {
    Drinkware: '20 oz Skinny Tumbler · 3 × 3 in',
    'Tech + Accessories': 'Acrylic Cup · 3 × 3 in',
    'Signs + Auto': 'Acrylic Keychain · 1.5 × 1.5 in',
    'Storage + Packaging': 'Hard-Shell Lunch Box · 4 × 3 in',
  },
  fallbackSize: '3 in',
  defaultPlacement: 'Drinkware',
  popular: 'Drinkware',
  guideImageUrl: '/uv-dtf-size-guide.webp',
  guideImageAlt: 'UV DTF size guide: recommended decal sizes for drinkware, tech, signs, auto, and packaging',
  guideNote: 'Pick a category below to list its items and sizes. Use Custom to type any width × height.',
  pickDetail: 'Pick the kind of item, then tap yours.',
  pickHint: 'Pick the kind of item, then tap yours to see its decal size. New uploads start at that size, and you can change any design in step 4.',
  itemPicker: true,
  standardSizes: [
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
}
