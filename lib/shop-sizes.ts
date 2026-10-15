/**
 * Shop Builder placements and print sizes, shared by the shop page and the
 * server-side build (/api/project/ingest) so both read the same tables.
 */

export const placements = ['Left Chest', 'Toddler Shirt', 'Youth Shirt', 'Adult Shirt', 'Hoodie Front', 'Hoodie Back', 'Hat', 'Sleeve', 'Custom']
export const sizeOptions: Record<string, string[]> = {
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
  Custom: ['3 in', '4 in', '5 in', '6 in', '8 in', '10 in', '12 in', '14 in'],
  default: ['3 in', '4 in', '5 in', '6 in', '10.5 in', '12 in'],
}

export function recommendedSize(type: string) {
  if (type === 'Left Chest') return 'Standard Left Chest · 3.75 × 3.75 in'
  if (type === 'Youth Shirt') return 'Small · 8.5 × 9 in'
  if (type === 'Toddler Shirt') return '4T · 6.5 × 7 in'
  if (type === 'Adult Shirt') return 'Medium · 10.5 × 12 in'
  if (type === 'Hoodie Front') return 'Medium · 10.5 × 11 in'
  if (type === 'Hoodie Back') return 'Medium · 10.5 × 12 in'
  if (type === 'Hat') return 'Medium · 4 in'
  return '10.5 in'
}
