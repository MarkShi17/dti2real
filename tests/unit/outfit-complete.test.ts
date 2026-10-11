import { describe, expect, it } from 'vitest';
import { DEMO_GARMENTS } from '@/lib/fixtures';
import { outfitSignature, requiredPieces } from '@/lib/outfit';
import { outfitInputSchema } from '@/lib/schema';

describe('complete outfit selection', () => {
  it('retains repeated categories, dresses with layers and all accessories', () => {
    const garments = [...DEMO_GARMENTS, ...['top', 'bottom', 'dress', 'outerwear', 'hosiery', 'headwear', 'other'].map((category, i) => ({ ...DEMO_GARMENTS[0], id: `extra-${i}`, category: category as typeof DEMO_GARMENTS[number]['category'] }))];
    expect(requiredPieces(garments, true).map(g => g.id)).toEqual(garments.map(g => g.id));
    expect(requiredPieces(garments.map(g => ({ ...g, visible: false })), true)).toEqual([]);
    expect(requiredPieces(DEMO_GARMENTS, false).map(g => g.category)).toEqual(['bottom', 'top']);
  });
  it('includes screenshot, face and edited garment details in outfit identity', () => {
    const context = { screenshotId: 'sample', faceId: 'face' };
    const key = outfitSignature('studio', {}, DEMO_GARMENTS, context);
    expect(outfitSignature('studio', {}, DEMO_GARMENTS, { ...context, screenshotId: 'different' })).not.toBe(key);
    expect(outfitSignature('studio', {}, DEMO_GARMENTS, { ...context, faceId: 'new' })).not.toBe(key);
    expect(outfitSignature('studio', {}, DEMO_GARMENTS.map(g => ({ ...g, name: 'Edited' })), context)).not.toBe(key);
  });
  it('keeps screenshot and face references and rejects duplicate garment and product IDs', () => {
    const input = { screenshotId: 'sample', faceId: '11111111-1111-4111-8111-111111111111', garments: DEMO_GARMENTS, productIds: ['one'] };
    expect(outfitInputSchema.parse(input)).toMatchObject({ screenshotId: input.screenshotId, faceId: input.faceId });
    expect(outfitInputSchema.safeParse({ ...input, garments: [DEMO_GARMENTS[0], DEMO_GARMENTS[0]] }).success).toBe(false);
    expect(outfitInputSchema.safeParse({ ...input, productIds: ['one', 'one'] }).success).toBe(false);
  });
  it('matches equivalent client and schema-parsed garment objects regardless of property order', () => {
    const { bbox, attributes, ...rest } = DEMO_GARMENTS[0];
    const manual = { ...rest, attributes: Object.fromEntries(Object.entries(attributes).reverse()) as typeof attributes, bbox };
    const parsed = outfitInputSchema.parse({ garments: [manual], productIds: ['one'], screenshotId: 'sample' });
    expect(outfitSignature('studio', {}, [manual], { screenshotId: 'sample' })).toBe(outfitSignature('studio', {}, parsed.garments, { screenshotId: 'sample' }));
  });
});
