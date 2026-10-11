import { describe, expect, it } from 'vitest';
import { clampBox, garmentSchema } from '@/lib/schema';
import { filterAndRank, generateQueries } from '@/lib/ranking';
import { compositionOrder, renderKey } from '@/lib/outfit';
import { safeExternalUrl, isPublicAddress } from '@/lib/security';
import { DEMO_GARMENTS, demoProducts } from '@/lib/fixtures';

describe('garment boundaries', () => {
  it('clamps a region inside the source image', () => {
    expect(clampBox({ x: -.2, y: .9, w: 2, h: .6 })).toEqual({ x: 0, y: .9, w: 1, h: expect.closeTo(.1) });
  });
  it('rejects unknown garment categories', () => {
    expect(garmentSchema.safeParse({ ...DEMO_GARMENTS[0], category: 'face' }).success).toBe(false);
  });
  it('generates queries from edited descriptors, without game words', () => {
    const g = { ...DEMO_GARMENTS[0], name: 'Ribbed sweater', searchQueries: [], attributes: { color: ['cream'], material: 'wool' } };
    expect(generateQueries(g).join(' ')).toContain('cream');
    expect(generateQueries(g).join(' ')).toContain('wool');
  });
});
describe('shopping fidelity and honest filters', () => {
  const garment = DEMO_GARMENTS[0];
  it('excludes unpriced and non-USD listings under a price cap', () => {
    const base = demoProducts(garment)[0];
    const results = filterAndRank([
      { ...base, id: 'unknown', price: undefined },
      { ...base, id: 'eur', price: 15, currency: 'EUR' },
      { ...base, id: 'usd', price: 15, currency: 'USD' }
    ], garment, { priceMax: 20, marketplaces: [], secondhandOnly: false, sortBy: 'best_match' });
    expect(results.map(p => p.id)).toEqual(['usd']);
  });
  it('does not infer secondhand from a marketplace name', () => {
    const p = { ...demoProducts(garment)[0], source: 'eBay', condition: 'unknown' as const, thrift: false };
    expect(filterAndRank([p], garment, { marketplaces: [], secondhandOnly: true, sortBy: 'best_match' })).toEqual([]);
  });
});
describe('wardrobe composition and cache identity', () => {
  it('renders bottoms before tops and excludes unsupported accessories', () => {
    expect(compositionOrder(DEMO_GARMENTS).map(g => g.category)).toEqual(['bottom', 'top']);
  });
  it('a dress excludes competing top and bottom layers', () => {
    expect(compositionOrder([...DEMO_GARMENTS, { ...DEMO_GARMENTS[0], id: 'dress', category: 'dress' }]).map(g => g.category)).toEqual(['dress']);
  });
  it('changes render identity for product, person, pose and renderer changes', () => {
    const a = renderKey({ person: 'a', products: ['one'], pose: 'runway', provider: 'demo' });
    for (const change of [{ person: 'b' }, { products: ['two'] }, { pose: 'hip' }, { provider: 'live' }]) {
      expect(renderKey({ person: 'a', products: ['one'], pose: 'runway', provider: 'demo', ...change })).not.toBe(a);
    }
  });
});
describe('external address validation', () => {
  it.each(['http://example.com/a', 'javascript:alert(1)', 'https://localhost/a', 'https://127.0.0.1/a', 'https://user:pass@example.com/a', 'https://192.168.0.1/a', 'https://[::1]/a'])('rejects %s', url => {
    expect(safeExternalUrl(url)).toBeUndefined();
  });
  it.each(['127.0.0.1', '10.2.3.4', '169.254.169.254', '172.16.1.2', '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1'])('blocks internal address %s', ip => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it('accepts a public HTTPS listing', () => expect(safeExternalUrl('https://www.ebay.com/itm/123')).toBe('https://www.ebay.com/itm/123'));
});
