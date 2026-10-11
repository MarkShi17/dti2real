import type { Garment, ImageRef, PoseId, ProductListing } from './schema';

export const EXAMPLE_ID = 'fitexample-v1';
export const EXAMPLE_SOURCE_ID = 'sample-fitexample-v1';
export const EXAMPLE_TIMING = { analysis: 3000, searchBatch: 2000, render: 8000, pose: 2500 } as const;

export const exampleScreenshot: ImageRef = {
  id: EXAMPLE_SOURCE_ID, url: '/demo/fitexample-v1/source.webp', width: 798, height: 1971,
  hash: EXAMPLE_ID, kind: 'screenshot', isSample: true,
};
export const exampleStudioImage = '/demo/fitexample-v1/before-runway.webp';
export const exampleRender = (pose: PoseId) => `/demo/fitexample-v1/${pose}.webp`;

export const EXAMPLE_GARMENTS: Garment[] = [
  { id: 'example-top', name: 'Forest-green asymmetric off-shoulder sweater', category: 'top', attributes: { color: ['forest green'], material: 'loose knit', silhouette: 'asymmetric off-shoulder loose long-sleeve sweater', aesthetic: ['relaxed', 'editorial'], details: ["Wearer’s left shoulder exposed", 'neckline descends toward wearer’s left / viewer right', 'long loose sleeves'] }, bbox: { x: .21, y: .344, w: .50, h: .284 }, confidence: .99, searchQueries: ['forest green asymmetric off shoulder loose long sleeve sweater', 'green off shoulder oversized knit sweater'], visible: true },
  { id: 'example-bottom', name: 'Navy wide-leg trousers', category: 'bottom', attributes: { color: ['navy'], material: 'woven fabric', silhouette: 'loose wide-leg full-length trousers', aesthetic: ['relaxed'], details: ['full length', 'wide leg'] }, bbox: { x: .292, y: .596, w: .39, h: .354 }, confidence: .99, searchQueries: ['navy loose wide leg full length trousers', 'navy wide leg pants'], visible: true },
  { id: 'example-bag', name: 'Burgundy crossbody bag', category: 'bag', attributes: { color: ['burgundy'], material: 'leather', silhouette: 'crossbody bag', aesthetic: ['classic'], details: ["Wearer’s right hip / viewer left", 'strap runs from left shoulder diagonally across chest'] }, bbox: { x: .265, y: .339, w: .407, h: .264 }, confidence: .98, searchQueries: ['burgundy leather crossbody bag', 'burgundy shoulder crossbody purse'], visible: true },
  { id: 'example-shoes', name: 'Taupe-gray rounded-toe flats', category: 'shoes', attributes: { color: ['taupe gray'], material: 'leather', silhouette: 'rounded-toe flats', aesthetic: ['minimal'], details: ['flat sole', 'rounded toe'] }, bbox: { x: .378, y: .914, w: .221, h: .052 }, confidence: .98, searchQueries: ['taupe gray rounded toe flats', 'taupe ballet flats rounded toe'], visible: true },
];

const product = (garmentId: string, title: string, price: number): ProductListing => ({
  id: `${garmentId}-0`, garmentId, title, source: 'fitEXAMPLE catalog', productUrl: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(title)}`,
  imageUrl: `/demo/fitexample-v1/products/${garmentId.replace('example-', '')}.webp`, price, currency: 'USD', condition: 'new', thrift: false, isDemo: true,
  category: EXAMPLE_GARMENTS.find(g => g.id === garmentId)!.category,
});
export const EXAMPLE_PRODUCTS: ProductListing[] = [
  product('example-top', 'Forest green asymmetric off shoulder sweater', 68), product('example-bottom', 'Navy loose wide leg trousers', 72),
  product('example-bag', 'Burgundy leather crossbody bag', 84), product('example-shoes', 'Taupe gray rounded toe flats', 54),
];

export const isExampleSource = (id: string | undefined) => id === EXAMPLE_SOURCE_ID;
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
function fixtureGarment(garment: Garment) {
  return {
    id: garment.id, name: garment.name, category: garment.category, attributes: garment.attributes, bbox: garment.bbox,
    confidence: garment.confidence, searchQueries: garment.searchQueries, visible: garment.visible, segmentation: garment.segmentation,
  };
}
export function isSupportedExampleOutfit(garments: Garment[], products: ProductListing[]) {
  if (garments.length !== EXAMPLE_GARMENTS.length || products.length !== EXAMPLE_PRODUCTS.length) return false;
  const byId = new Map(garments.map(garment => [garment.id, garment]));
  if (byId.size !== EXAMPLE_GARMENTS.length || !EXAMPLE_GARMENTS.every(canonical => {
    const garment = byId.get(canonical.id);
    return !!garment && stable(fixtureGarment(garment)) === stable(fixtureGarment(canonical));
  })) return false;
  return EXAMPLE_PRODUCTS.every(canonical => {
    const product = products.find(candidate => candidate.id === canonical.id);
    if (!product) return false;
    return product.id === canonical.id && product.garmentId === canonical.garmentId && product.title === canonical.title && product.source === canonical.source && product.productUrl === canonical.productUrl && product.imageUrl === canonical.imageUrl && product.isDemo === true && product.category === canonical.category;
  });
}
