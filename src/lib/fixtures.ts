import type { Garment, PoseId, ProductListing } from './schema';
export const POSES: { id: PoseId; name: string; short: string; prompt: string }[] = [
  { id: 'runway', name: 'Neutral runway', short: 'Runway', prompt: 'front facing full body standing naturally, arms down, feet slightly apart' },
  { id: 'hip', name: 'Hand on hip', short: 'On the hip', prompt: 'full body with one hand on hip and weight shifted to one leg' },
  { id: 'peace', name: 'Peace sign', short: 'Peace out', prompt: 'full body, raise one hand making a V peace sign and a slight head tilt' },
  { id: 'shoulder', name: 'Over-the-shoulder', short: 'Look back', prompt: 'full body three quarter back view, looking over shoulder toward camera' },
  { id: 'lean', name: 'Dramatic lean', short: 'The lean', prompt: 'full body controlled editorial leaning stance with crossed legs' }
];
export const DEMO_GARMENTS: Garment[] = [
  { id: 'demo-top', name: 'Midnight knit', category: 'top', attributes: { color: ['black'], material: 'ribbed knit', silhouette: 'fitted high neck', aesthetic: ['dark academia', 'minimal'], details: ['long sleeves'] }, bbox: { x: .28, y: .24, w: .44, h: .26 }, confidence: .96, searchQueries: ['black fitted high neck ribbed sweater', 'black long sleeve turtleneck knit top'], visible: true },
  { id: 'demo-bottom', name: 'Silver pleats', category: 'bottom', attributes: { color: ['silver', 'gray'], material: 'satin', silhouette: 'pleated maxi', aesthetic: ['editorial'], details: ['high waist'] }, bbox: { x: .32, y: .38, w: .39, h: .47 }, confidence: .93, searchQueries: ['silver gray pleated maxi skirt', 'metallic gray high waist pleated skirt'], visible: true },
  { id: 'demo-shoes', name: 'City ankle boots', category: 'shoes', attributes: { color: ['black'], material: 'leather', silhouette: 'block heel' }, bbox: { x: .44, y: .82, w: .19, h: .15 }, confidence: .91, searchQueries: ['black leather block heel ankle boots'], visible: true },
  { id: 'demo-bag', name: 'Little shoulder bag', category: 'bag', attributes: { color: ['black'], material: 'leather', silhouette: 'mini shoulder' }, bbox: { x: .57, y: .26, w: .1, h: .16 }, confidence: .82, searchQueries: ['black mini shoulder bag silver hardware'], visible: true },
  { id: 'demo-jewelry', name: 'Silver pendant', category: 'jewelry', attributes: { color: ['silver'], material: 'silver', silhouette: 'fine chain' }, bbox: { x: .43, y: .235, w: .14, h: .045 }, confidence: .72, searchQueries: ['silver fine chain pendant necklace'], visible: true }
];
const demoNames: Record<string, string[]> = {
  top: ['Black ribbed high-neck knit', 'Black fitted mock-neck sweater', 'Soft black wool turtleneck'],
  bottom: ['Silver satin pleated maxi skirt', 'Burgundy pleated maxi skirt', 'Charcoal flowing pleated skirt'],
  shoes: ['Black leather block-heel boots', 'Black zip ankle boots', 'Black square-toe leather boots'],
  bag: ['Black mini shoulder bag', 'Black curved shoulder bag', 'Vintage black leather baguette'],
  jewelry: ['Silver fine-chain pendant', 'Minimal silver necklace', 'Vintage silver chain']
};
export function demoProducts(g: Garment): ProductListing[] {
  const names = demoNames[g.category] || [`${g.name} sample`, `${g.name} alternative`, `${g.name} vintage sample`];
  return names.map((title, i) => ({
    id: `fixture-${g.id}-${i}`, garmentId: g.id, title, source: ['Studio sample', 'Archive sample', 'Vintage sample'][i],
    productUrl: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(title)}`,
    imageUrl: `/demo/products/${g.category}${g.category === 'bottom' && i === 1 ? '-burgundy' : ''}.webp`,
    price: i === 2 ? undefined : [48, 64, 38, 32, 22][['top', 'bottom', 'shoes', 'bag', 'jewelry'].indexOf(g.category)] ?? 40,
    currency: 'USD', condition: i === 2 ? 'used' : 'new', thrift: i === 2, isDemo: true,
    variant: g.category === 'bottom' && i === 1 ? 'burgundy' : 'silver', category: g.category,
  }));
}
export const sampleImage = '/demo/sample.webp';
export const studioImage = '/demo/base-runway.webp';
export function demoRender(pose: PoseId, variant: 'silver' | 'burgundy' = 'silver') { return `/demo/${variant}-${pose}.webp`; }
