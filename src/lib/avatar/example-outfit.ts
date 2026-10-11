import type { Garment, ProductListing } from '@/lib/schema';
import { isSupportedExampleOutfit } from '@/lib/examples';

/** The approved fixture is intentionally narrow: these IDs select authored mesh,
 * never a screenshot or a retailer image. */
export const exampleFixtureId = 'fitexample-v1' as const;
export const exampleFixtureProducts = {
  top: 'example-top-0', bottom: 'example-bottom-0', bag: 'example-bag-0', shoes: 'example-shoes-0',
} as const;
export function isExampleOutfitSelection(garments: Garment[], products: ProductListing[]) {
  return isSupportedExampleOutfit(garments, products);
}
export const exampleMeshNames = ['example-sweater','example-trousers','example-bag','example-strap','example-flats','example-bob','example-strap-back'] as const;

/** Match the authored neckline in bind space; keep exposed shoulder and hands. */
export function coveredByExampleClothing([x,y,z]:[number,number,number],hand=false) {
  if(hand) return false;
  if(y>1.515 && (z<.085 || Math.abs(x)>.075)) return true;
  if(y > .08 && y < .89) return true;
  if(y < .855) return y < .045;
  if(Math.abs(x) > .23) return y < 1.34 && y > .91;
  return y < 1.30-.32*x;
}
