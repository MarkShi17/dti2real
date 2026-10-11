import type { Garment } from './schema';
export function compositionOrder(garments: Garment[]): Garment[] {
  const visible = garments.filter(g => g.visible);
  const dress = visible.find(g => g.category === 'dress');
  // Outerwear/accessories remain in the shopping tray: sequential outerwear can overwrite tops.
  return dress ? [dress] : ['bottom', 'top'].flatMap(c => visible.filter(g => g.category === c).slice(0, 1));
}
export function renderKey(input: { person: string; products: string[]; pose: string; provider: string }): string {
  return JSON.stringify(input);
}
export function outfitSignature(personId: string, selected: Record<string, string>, garments: Garment[]) {
  return JSON.stringify([personId, garments.filter(g => g.visible).map(g => [g.id, g.category, selected[g.id]]).sort()]);
}
