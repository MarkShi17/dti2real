import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { DEMO_GARMENTS, demoProducts } from '@/lib/fixtures';
import { packProductReferences, validateLayeringPlan, validateQualityReview, OpenAIOutfit, renderReviewedOutfit } from '@/lib/providers/openai-outfit';
import type { LayeringPlan, QualityReview } from '@/lib/schema';

const garments = Array.from({ length: 16 }, (_, i) => ({ ...DEMO_GARMENTS[i % 5], id: `g${i}` }));
const image = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#aaa' } }).webp().toBuffer();
const refs = garments.map((garment, i) => ({ garment, product: { ...demoProducts(garment)[0], id: `p${i}`, garmentId: garment.id, isDemo: false }, image, hash: `h${i}` }));
const plan: LayeringPlan = { pieces: refs.map(r => ({ garmentId: r.garment.id, productId: r.product.id, placement: 'Wear on body', over: [], under: [], visibleEdges: 'Visible hems', tucking: 'Untucked', closure: 'Open', accessoryPosition: 'Natural contact' })), unmapped: [], instructions: 'Preserve every product.' };
const review: QualityReview = { passed: true, products: refs.map(r => ({ garmentId: r.garment.id, productId: r.product.id, appearance: true, placement: true, issues: [] })), checks: { layering: true, identity: true, anatomy: true, accessories: true, fabrics: true, clipping: true, pose: true }, issues: [], repairInstructions: '' };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('layering and quality contracts', () => {
  it('rejects missing, duplicate and invented product mappings', () => {
    expect(validateLayeringPlan(plan, refs)).toEqual(plan);
    expect(() => validateLayeringPlan({ ...plan, pieces: plan.pieces.slice(1) }, refs)).toThrow(/mapping/i);
    expect(() => validateLayeringPlan({ ...plan, pieces: [plan.pieces[0], ...plan.pieces.slice(0, 15)] }, refs)).toThrow(/mapping/i);
    expect(() => validateLayeringPlan({ ...plan, pieces: plan.pieces.map(p => ({ ...p, productId: 'invented' })) }, refs)).toThrow(/mapping/i);
  });
  it('rejects self-overlaps, cycles and reports unmapped source garments', () => {
    expect(() => validateLayeringPlan({ ...plan, pieces: plan.pieces.map(p => ({ ...p, over: [p.garmentId] })) }, refs)).toThrow(/layer/i);
    expect(() => validateLayeringPlan({ ...plan, pieces: plan.pieces.map((p, i) => ({ ...p, over: [plan.pieces[(i + 1) % 16].garmentId] })) }, refs)).toThrow(/layer/i);
    expect(() => validateLayeringPlan({ ...plan, unmapped: [{ sourceId: 'source-unknown', description: 'Unmatched scarf' }] }, refs)).toThrow('Unmatched scarf');
  });
  it('requires a check for every product and fails contradictory passes', () => {
    expect(validateQualityReview(review, refs).passed).toBe(true);
    expect(() => validateQualityReview({ ...review, products: review.products.slice(1) }, refs)).toThrow(/mapping/i);
    expect(validateQualityReview({ ...review, checks: { ...review.checks, anatomy: false } }, refs).passed).toBe(false);
    expect(validateQualityReview({ ...review, products: review.products.map(p => ({ ...p, appearance: false })) }, refs).passed).toBe(false);
  });
});
it('packs all 16 products into labeled boards without truncating references', async () => {
  const packed = await packProductReferences(refs);
  expect(packed.length).toBeLessThanOrEqual(12);
  expect(packed.flatMap(p => p.productIds)).toEqual(refs.map(r => r.product.id));
  expect(packed.flatMap(p => p.garmentIds)).toEqual(garments.map(g => g.id));
  for (const p of packed) expect((await sharp(p.image).metadata()).width).toBeGreaterThan(64);
  expect(await packProductReferences(refs.slice(0, 12))).toHaveLength(12);
});
it('uses direct OpenAI credentials and the exact settings; never resubmits ambiguous failures', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'image-only'); vi.stubEnv('VISION_API_KEY', 'analysis-only');
  const fetcher = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')); vi.stubGlobal('fetch', fetcher);
  const provider = new OpenAIOutfit();
  await expect(provider.edit({ person: image, references: refs.slice(0, 1), plan: { ...plan, pieces: plan.pieces.slice(0, 1) } })).rejects.toThrow(/may.*charge|may.*finish/i);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/images/edits');
  expect(init.headers.Authorization).toBe('Bearer image-only');
  expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-image-2.5-sunburst', quality: 'max', size: '1024x1536', n: 1 });
});
it('reviews every candidate, repairs at most twice, and rejects failures', async () => {
  const provider = new OpenAIOutfit();
  vi.spyOn(provider, 'edit').mockResolvedValue({ image, latencyMs: 10 });
  const failing = { ...review, passed: false, issues: ['Floating bag'], repairInstructions: 'Place the bag on the shoulder.' };
  vi.spyOn(provider, 'review').mockResolvedValue({ review: failing, latencyMs: 1 });
  await expect(renderReviewedOutfit(provider, { person: image, references: refs, plan }, async () => {})).rejects.toThrow('Floating bag');
  expect(provider.edit).toHaveBeenCalledTimes(3); expect(provider.review).toHaveBeenCalledTimes(3);
});
it('retains failed review and usage diagnostics without accepting any candidate', async () => {
  const provider = new OpenAIOutfit();
  vi.spyOn(provider, 'edit').mockResolvedValue({ image, latencyMs: 10, usage: { total_tokens: 42 } });
  vi.spyOn(provider, 'review').mockResolvedValue({ review: { ...review, passed: false, issues: ['Wrong bag side'], repairInstructions: 'Move bag to wearer right.' }, latencyMs: 1, usage: { total_tokens: 20 } });
  let failure;
  try { await renderReviewedOutfit(provider, { person: image, references: refs, plan }, async () => {}); } catch (e) { failure = e; }
  expect(failure).toMatchObject({ reviews: expect.any(Array), usage: expect.any(Array) });
  expect((failure as { reviews: unknown[] }).reviews).toHaveLength(3);
  expect((failure as { usage: unknown[] }).usage).toHaveLength(6);
});
it('accepts a repaired candidate only after a passing review', async () => {
  const provider = new OpenAIOutfit();
  vi.spyOn(provider, 'edit').mockResolvedValue({ image, latencyMs: 10 });
  vi.spyOn(provider, 'review').mockResolvedValueOnce({ review: { ...review, passed: false, issues: ['Clipping'], repairInstructions: 'Fix clipping.' }, latencyMs: 1 }).mockResolvedValueOnce({ review, latencyMs: 1 });
  const result = await renderReviewedOutfit(provider, { person: image, references: refs, plan }, async () => {});
  expect(result.reviews).toHaveLength(2); expect(result.reviews.at(-1)?.passed).toBe(true);
});
it.each([12, 16])('edits %i products with all four reserved references and reviews through separate credentials', async count => {
  vi.stubEnv('OPENAI_API_KEY', 'image-only'); vi.stubEnv('VISION_API_KEY', 'analysis-only'); vi.stubEnv('VISION_MODEL', 'gpt-5.4'); vi.stubEnv('VISION_BASE_URL', 'https://vision.example/v1');
  const selected = refs.slice(0, count), selectedPlan = { ...plan, pieces: plan.pieces.slice(0, count) }, selectedReview = { ...review, products: review.products.slice(0, count) };
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: image.toString('base64') }], usage: { total_tokens: 42 } }))).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(selectedReview) } }], usage: { total_tokens: 20 } })));
  vi.stubGlobal('fetch', fetcher);
  const provider = new OpenAIOutfit(), input = { person: image, face: image, previous: image, poseReference: image, references: selected, plan: selectedPlan };
  const output = await provider.edit(input); const checked = await provider.review(output.image, input);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.images.length).toBeLessThanOrEqual(16);
  for (const r of selected) expect(body.prompt).toContain(`"productId":"${r.product.id}"`);
  expect(fetcher.mock.calls[1][0]).toBe('https://vision.example/v1/chat/completions');
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer analysis-only');
  expect(checked.review.passed).toBe(true); expect(output.usage).toEqual({ total_tokens: 42 });
});
it.each([{ data: [] }, { data: [{ b64_json: Buffer.from('corrupt').toString('base64') }] }])('rejects empty and corrupt provider responses before review', async raw => {
  vi.stubEnv('OPENAI_API_KEY', 'image-only');
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw))); vi.stubGlobal('fetch', fetcher);
  await expect(new OpenAIOutfit().edit({ person: image, references: refs, plan })).rejects.toThrow(/usable|corrupt/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
