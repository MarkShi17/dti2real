import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseShoppingResults, liveSearch } from '@/lib/providers/shopping';
import { parseVisionResult } from '@/lib/providers/vision';
import { providerStatus } from '@/lib/providers/config';
import { DEMO_GARMENTS } from '@/lib/fixtures';
import { generateQueries } from '@/lib/ranking';
import { defaultFilters } from '@/lib/schema';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
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

it('keeps real matches when one of the two shopping queries fails', async () => {
  vi.stubEnv('SERPAPI_KEY','test-only');vi.stubEnv('EBAY_CLIENT_ID','');vi.stubEnv('EBAY_CLIENT_SECRET','');
  const garment=DEMO_GARMENTS[0], first=generateQueries(garment)[0];
  vi.stubGlobal('fetch',vi.fn(async(input:string)=>new URL(input).searchParams.get('q')===first
    ? Response.json({shopping_results:[{title:'Black ribbed knit top',source:'Actual retailer',product_link:'https://shop.example.com/knit',thumbnail:'https://images.example.com/knit.webp'}]})
    : new Response('',{status:503})));
  const result=await liveSearch(garment,defaultFilters);
  expect(result.products).toHaveLength(1);expect(result.products[0].isDemo).toBe(false);
  expect(result.warnings.join(' ')).toMatch(/query/i);
});

it('broadens empty precise searches instead of leaving an obvious garment unmatched', async () => {
  vi.stubEnv('SERPAPI_KEY','test-only');vi.stubEnv('EBAY_CLIENT_ID','');vi.stubEnv('EBAY_CLIENT_SECRET','');
  const garment={...DEMO_GARMENTS[0],name:'White fitted camisole tank',attributes:{color:['white']},searchQueries:['white fitted v-neck spaghetti strap cropped camisole tank','white strappy fitted stretch knit cami top']};
  vi.stubGlobal('fetch',vi.fn(async(input:string)=>Response.json({shopping_results:new URL(input).searchParams.get('q')==='white camisole'?[{title:'White camisole',source:'Actual retailer',product_link:'https://shop.example.com/cami',thumbnail:'https://images.example.com/cami.webp'}]:[]})));
  const result=await liveSearch(garment,defaultFilters);
  expect(result.products).toHaveLength(1);expect(result.warnings.join(' ')).toMatch(/broader/i);
});

it('defaults to simple Sunburst outfit and pose edits without requiring vision credentials', () => {
  vi.stubEnv('DEMO_MODE', 'false'); vi.stubEnv('TRYON_PROVIDER', ''); vi.stubEnv('POSE_PROVIDER', '');
  vi.stubEnv('OUTFIT_PROMPT_MODE', 'simple'); vi.stubEnv('OPENAI_API_KEY', 'image-test');
  vi.stubEnv('VISION_API_KEY', ''); vi.stubEnv('VISION_MODEL', '');
  const status = providerStatus();
  expect(status.tryon).toMatchObject({ name: 'openai_outfit', mode: 'live' });
  expect(status.pose).toMatchObject({ name: 'openai_outfit', mode: 'live' });
  expect(status.tryon.detail).toContain('every selected product');
  expect(status.tryon.detail).not.toMatch(/GPT-5.4|review/i);
});
