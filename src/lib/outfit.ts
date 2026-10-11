import { garmentSchema, type Garment } from './schema';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function compositionOrder(garments: Garment[]): Garment[] {
  const visible = garments.filter(g => g.visible);
  const dress = visible.find(g => g.category === 'dress');
  // Outerwear/accessories remain in the shopping tray: sequential outerwear can overwrite tops.
  return dress ? [dress] : ['bottom', 'top'].flatMap(c => visible.filter(g => g.category === c).slice(0, 1));
}
export function renderKey(input: { person: string; products: string[]; pose: string; provider: string }): string {
  return JSON.stringify(input);
}
export function requiredPieces(garments: Garment[], complete: boolean): Garment[] {
  return complete ? garments.filter(g => g.visible) : compositionOrder(garments);
}
export function outfitSignature(personId: string, selected: Record<string, string>, garments: Garment[], context?: { screenshotId?: string; faceId?: string }) {
  if (context) return JSON.stringify(canonical(['outfit-v2', personId, context.screenshotId || null, context.faceId || null, garments.filter(g => g.visible).map(raw => {
    const parsed = garmentSchema.safeParse(raw);
    const { segmentation: _segmentation, ...g } = parsed.success ? parsed.data : raw;
    return [g.id, g, selected[g.id]];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]));
  return JSON.stringify([personId, garments.filter(g => g.visible).map(g => [g.id, g.category, selected[g.id]]).sort()]);
}
