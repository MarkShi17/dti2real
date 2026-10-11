import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storage } from '@/lib/storage';
import { queueTryon, queuePose } from '@/lib/jobs';
import { DEMO_GARMENTS, demoProducts } from '@/lib/fixtures';
import { OpenAIOutfit } from '@/lib/providers/openai-outfit';
import { fetchImage } from '@/lib/security';
import type { LayeringPlan, QualityReview } from '@/lib/schema';
import { NextRequest } from 'next/server';
import { GET as getJob } from '@/app/api/jobs/[id]/route';
vi.mock('@/lib/security', async original => ({ ...await original<typeof import('@/lib/security')>(), fetchImage: vi.fn() }));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dti-outfit-'));
  vi.stubEnv('DATA_DIR', root); vi.stubEnv('DEMO_MODE', 'false'); vi.stubEnv('TRYON_PROVIDER', 'openai_outfit'); vi.stubEnv('POSE_PROVIDER', 'openai_outfit'); vi.stubEnv('OPENAI_API_KEY', 'image-key'); vi.stubEnv('VISION_API_KEY', 'vision-key'); vi.stubEnv('VISION_MODEL', 'gpt-5.4');
  const image = await readFile('public/demo/base-runway.webp');
  vi.mocked(fetchImage).mockResolvedValue(image);
  vi.spyOn(OpenAIOutfit.prototype, 'analyze').mockImplementation(async (_screenshot, refs) => ({ plan: { pieces: refs.map(r => ({ garmentId: r.garment.id, productId: r.product.id, placement: 'Natural', over: [], under: [], visibleEdges: 'Hems', tucking: 'Untucked', closure: 'Open', accessoryPosition: 'Contact' })), unmapped: [], instructions: 'Layer naturally' } satisfies LayeringPlan, latencyMs: 1, usage: undefined }));
  vi.spyOn(OpenAIOutfit.prototype, 'edit').mockResolvedValue({ image, latencyMs: 1 });
  vi.spyOn(OpenAIOutfit.prototype, 'review').mockImplementation(async (_image, input) => ({ review: { passed: true, products: input.references.map(r => ({ garmentId: r.garment.id, productId: r.product.id, appearance: true, placement: true, issues: [] })), checks: { layering: true, identity: true, anatomy: true, accessories: true, fabrics: true, clipping: true, pose: true }, issues: [], repairInstructions: '' } satisfies QualityReview, latencyMs: 1 }));
});
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
async function setup() {
  const sid = await storage.create();
  const products = DEMO_GARMENTS.map(g => ({ ...demoProducts(g)[0], id: `real-${g.id}`, isDemo: false, imageUrl: `https://retailer.example/${g.id}.webp` }));
  await storage.update(sid, d => { products.forEach(p => { d.products[p.id] = p; }); });
  return { sid, input: { personId: 'studio', screenshotId: 'sample', garments: DEMO_GARMENTS, productIds: products.map(p => p.id), force: false } };
}
it('requires every visible product, excludes hidden pieces and validates session-owned screenshot and face', async () => {
  const { sid, input } = await setup();
  await expect(queueTryon(sid, { ...input, productIds: input.productIds.slice(0, 2) })).rejects.toThrow(/City ankle boots.*Little shoulder bag.*Silver pendant/);
  const other = await storage.create();
  const screenshot = await storage.putImage(other, await readFile('public/demo/sample.webp'), 'screenshot');
  const face = await storage.putImage(other, await readFile('public/demo/base-runway.webp'), 'face');
  await expect(queueTryon(sid, { ...input, screenshotId: screenshot.id })).rejects.toThrow(/Screenshot.*session/);
  await expect(queueTryon(sid, { ...input, faceId: face.id })).rejects.toThrow(/Face.*session/);
  await expect(queueTryon(sid, { ...input, screenshotId: undefined })).rejects.toThrow(/screenshot/i);
  const task = await queueTryon(sid, { ...input, garments: input.garments.map(g => ({ ...g, visible: g.category === 'top' })), productIds: [input.productIds[0]] }); await task.run();
  expect((await storage.read(sid)).jobs[task.job.id].status).toBe('completed');
});
it('persists only accepted reviewed outfits, reuses cached renders, and repairs a retry with all references', async () => {
  const { sid, input } = await setup();
  const first = await queueTryon(sid, input); await first.run();
  const accepted = (await storage.read(sid)).jobs[first.job.id].result!;
  expect(accepted.outfit?.references).toHaveLength(5);
  expect(accepted.outfit?.reviews.at(-1)?.passed).toBe(true);
  const cache = await queueTryon(sid, input); expect(cache.job.result?.id).toBe(accepted.id);
  const retry = await queueTryon(sid, { ...input, retryGarmentId: 'demo-bag' }); await retry.run();
  const calls = vi.mocked(OpenAIOutfit.prototype.edit).mock.calls;
  expect(calls.at(-1)?.[0].references).toHaveLength(5);
  expect(calls.at(-1)?.[0].previous).toBeDefined();
  expect(calls.at(-1)?.[0].retryGarmentId).toBe('demo-bag');
});
it('uses frozen products and review for all five poses and uploaded person/face references', async () => {
  const { sid, input } = await setup();
  const person = await storage.putImage(sid, await readFile('public/demo/base-runway.webp'), 'person');
  const face = await storage.putImage(sid, await readFile('public/demo/base-runway.webp'), 'face');
  const first = await queueTryon(sid, { ...input, personId: person.id, faceId: face.id }); await first.run();
  const accepted = (await storage.read(sid)).jobs[first.job.id].result!;
  expect(accepted.pose).toBe('original');
  await storage.update(sid, d => { d.products = {}; });
  for (const pose of ['runway', 'hip', 'peace', 'shoulder', 'lean'] as const) {
    const task = await queuePose(sid, accepted.id, pose); await task.run();
    const result = (await storage.read(sid)).jobs[task.job.id].result!;
    expect(result.pose).toBe(pose); expect(result.baseRenderId).toBe(accepted.id);
    expect(result.outfit?.reviews.at(-1)?.passed).toBe(true);
    expect(vi.mocked(OpenAIOutfit.prototype.edit).mock.calls.at(-1)?.[0].face).toBeDefined();
  }
});
it('preserves accepted history and cache when all review attempts fail or output is corrupt', async () => {
  const { sid, input } = await setup(); const first = await queueTryon(sid, input); await first.run();
  const prior = (await storage.read(sid)).jobs[first.job.id].result!;
  vi.spyOn(OpenAIOutfit.prototype, 'review').mockImplementation(async (_image, args) => ({ review: { passed: false, products: args.references.map(r => ({ garmentId: r.garment.id, productId: r.product.id, appearance: true, placement: false, issues: ['Floating accessory'] })), checks: { layering: false, identity: true, anatomy: true, accessories: false, fabrics: true, clipping: true, pose: true }, issues: ['Floating accessory'], repairInstructions: 'Attach bag to shoulder' }, latencyMs: 1 }));
  const failed = await queueTryon(sid, { ...input, force: true }); await failed.run();
  const data = await storage.read(sid); expect(data.jobs[failed.job.id].status).toBe('failed'); expect(Object.keys(data.renders)).toEqual([prior.id]);
  expect((await queueTryon(sid, input)).job.result?.id).toBe(prior.id);
  vi.spyOn(OpenAIOutfit.prototype, 'edit').mockResolvedValue({ image: Buffer.from('corrupt'), latencyMs: 1 });
  const corrupt = await queueTryon(sid, { ...input, force: true }); await corrupt.run();
  expect((await storage.read(sid)).jobs[corrupt.job.id].status).toBe('failed');
});
it('does not label an unreviewed legacy pose edit as an accepted complete outfit', async () => {
  const { sid, input } = await setup(); const first = await queueTryon(sid, input); await first.run();
  const accepted = (await storage.read(sid)).jobs[first.job.id].result!;
  vi.stubEnv('POSE_PROVIDER', 'fal'); vi.stubEnv('POSE_API_KEY', 'legacy');
  await expect(queuePose(sid, accepted.id, 'peace')).rejects.toThrow(/openai_outfit/);
});
it('invalidates cached results for source, face, garment edits and product reference changes', async () => {
  const { sid, input } = await setup(); const first = await queueTryon(sid, input); await first.run();
  const screenshot = await storage.putImage(sid, await readFile('public/demo/sample.webp'), 'screenshot');
  const face = await storage.putImage(sid, await readFile('public/demo/base-runway.webp'), 'face');
  for (const changed of [
    { ...input, screenshotId: screenshot.id },
    { ...input, faceId: face.id },
    { ...input, garments: input.garments.map(g => ({ ...g, name: `${g.name} edited` })) },
  ]) {
    const task = await queueTryon(sid, changed); expect(task.job.status).toBe('queued'); await task.run();
    expect((await storage.read(sid)).jobs[task.job.id].result?.outfitKey).not.toBe((await storage.read(sid)).jobs[first.job.id].result?.outfitKey);
  }
  await storage.update(sid, d => { d.products[input.productIds[0]].imageUrl = 'https://retailer.example/new-reference.webp'; });
  const changedImage = await queueTryon(sid, input); expect(changedImage.job.status).toBe('queued'); await changedImage.run();
  expect((await storage.read(sid)).jobs[changedImage.job.id].result?.outfit?.referenceKey).not.toBe((await storage.read(sid)).jobs[first.job.id].result?.outfit?.referenceKey);
});
it('covers all sixteen selected garments in the job and persisted references', async () => {
  const { sid, input } = await setup();
  const garments = Array.from({ length: 16 }, (_, i) => ({ ...DEMO_GARMENTS[i % 5], id: `g-${i}`, category: i === 5 ? 'dress' as const : i === 6 ? 'outerwear' as const : DEMO_GARMENTS[i % 5].category }));
  const products = garments.map(g => ({ ...demoProducts(g)[0], id: `p-${g.id}`, garmentId: g.id, isDemo: false, imageUrl: `https://retailer.example/${g.id}.webp` }));
  await storage.update(sid, d => { products.forEach(p => { d.products[p.id] = p; }); });
  const task = await queueTryon(sid, { ...input, garments, productIds: products.map(p => p.id) }); await task.run();
  const result = (await storage.read(sid)).jobs[task.job.id].result!;
  expect(result.productIds).toEqual(products.map(p => p.id)); expect(result.outfit?.references).toHaveLength(16); expect(result.outfit?.layeringPlan.pieces).toHaveLength(16);
});
it('keeps a nineteen-minute job active, expires at twenty minutes and rejects a late result', async () => {
  const { sid, input } = await setup(); const task = await queueTryon(sid, input);
  vi.useFakeTimers({ toFake: ['Date'] });
  const now = Date.now();
  const read = () => getJob(new NextRequest(`http://localhost/api/jobs/${task.job.id}`, { headers: { cookie: `dti2irl-session=${sid}` } }), { params: Promise.resolve({ id: task.job.id }) });
  vi.setSystemTime(now + 19 * 60000);
  expect((await (await read()).json()).status).toBe('queued');
  vi.setSystemTime(now + 20 * 60000);
  expect((await (await read()).json()).status).toBe('failed');
  await task.run();
  expect(Object.values((await storage.read(sid)).renders)).toHaveLength(0);
  expect(OpenAIOutfit.prototype.edit).not.toHaveBeenCalled();
});
