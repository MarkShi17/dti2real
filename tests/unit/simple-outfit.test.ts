import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { OpenAIOutfit } from '@/lib/providers/openai-outfit';
import { DEMO_GARMENTS, demoProducts } from '@/lib/fixtures';
import type { OutfitEditInput } from '@/lib/providers/openai-outfit';

const image = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#ccc' } }).png().toBuffer();
const categories = ['headwear', 'top', 'dress', 'other', 'hosiery', 'bag', 'hosiery', 'shoes', 'jewelry'] as const;
const names = ['Black beret', 'Black long sleeve top', 'Plaid pinafore dress', 'Black waist belt', 'Sheer tights', 'Shoulder bag', 'White leg warmers', 'Black Mary Jane heels', 'Silver necklace'];
const refs = categories.map((category, i) => {
  const garment = { ...DEMO_GARMENTS[0], id: `g-${i}`, name: names[i], category };
  return { garment, product: { ...demoProducts(garment)[0], id: `p-${i}`, garmentId: garment.id, isDemo: false }, image, hash: `h-${i}` };
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('sends the model and every selected product with rough placement, without a planner or repair prompt', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'image-test');
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: image.toString('base64') }] })));
  vi.stubGlobal('fetch', fetcher);
  const provider = new OpenAIOutfit() as OpenAIOutfit & { editSimple: (input: OutfitEditInput) => Promise<{ image: Buffer }> };
  expect(typeof provider.editSimple).toBe('function');
  await provider.editSimple({ person: image, references: refs, plan: { pieces: [], unmapped: [], instructions: 'Do not pass this planner instruction to the edit' } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.model).toBe('gpt-image-2.5-sunburst');
  expect(body.images).toHaveLength(refs.length + 1);
  for (const name of names) expect(body.prompt).toContain(name);
  expect(body.prompt).toContain('EVERY');
  expect(body.prompt).toContain('do not add extra');
  expect(body.prompt).not.toMatch(/Validated layering|Targeted repair|Do not pass this planner|wearer.*right|neutral studio|natural hands/);
});
