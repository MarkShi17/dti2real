import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseShoppingResults } from '@/lib/providers/shopping';
import { parseVisionResult } from '@/lib/providers/vision';
import { providerStatus } from '@/lib/providers/config';
import { DEMO_GARMENTS } from '@/lib/fixtures';
afterEach(() => vi.unstubAllEnvs());
describe('provider boundaries', () => {
  it('uses actual links and never invents unknown prices', () => {
    const p = parseShoppingResults({ shopping_results: [
      { title: 'Black knit', source: 'Real shop', product_link: 'https://shop.example.com/item/42', thumbnail: 'https://images.example.com/42.jpg' },
      { title: 'No link', source: 'Shop', thumbnail: 'https://images.example.com/43.jpg' },
      { title: 'Unsafe', link: 'http://localhost/a', thumbnail: 'https://images.example.com/a.jpg' }
    ] }, DEMO_GARMENTS[0]);
    expect(p).toHaveLength(1);
    expect(p[0].productUrl).toBe('https://shop.example.com/item/42');
    expect(p[0].price).toBeUndefined();
    expect(p[0].isDemo).toBe(false);
  });
  it('rejects malformed shopping responses rather than reporting no matches', () => {
    expect(() => parseShoppingResults({ nonsense: true }, DEMO_GARMENTS[0])).toThrow();
  });
  it('accepts genuinely empty search results', () => expect(parseShoppingResults({ shopping_results: [] }, DEMO_GARMENTS[0])).toEqual([]));
  it('rejects malformed vision output', () => expect(() => parseVisionResult('{"garments":[{"name":"top"}]}')).toThrow());
  it('normalizes vision regions and creates distinct stable item IDs', () => {
    const out = parseVisionResult(JSON.stringify({ garments: [{ ...DEMO_GARMENTS[0], bbox: { x: -.1, y: .2, w: 3, h: .2 } }, DEMO_GARMENTS[0]] }));
    expect(out[0].bbox?.x).toBe(0); expect(out[0].id).not.toBe(out[1].id);
  });
  it('does not mask a selected but misconfigured provider as demo', () => {
    vi.stubEnv('DEMO_MODE', 'false'); vi.stubEnv('TRYON_PROVIDER', 'fashn_api'); vi.stubEnv('FASHN_API_KEY', '');
    expect(providerStatus().tryon.mode).toBe('unavailable');
  });
});
