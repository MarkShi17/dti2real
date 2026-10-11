import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storage } from '@/lib/storage';
import { queueTryon, queuePose } from '@/lib/jobs';
import { DEMO_GARMENTS, demoProducts } from '@/lib/fixtures';
import { FashnHosted } from '@/lib/providers/tryon';
import { fetchImage } from '@/lib/security';

vi.mock('@/lib/security', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/security')>(), fetchImage: vi.fn() }));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dti2irl-live-contract-'));
  vi.stubEnv('DATA_DIR', root); vi.stubEnv('DEMO_MODE', 'false'); vi.stubEnv('TRYON_PROVIDER', 'fashn_api'); vi.stubEnv('FASHN_API_KEY', 'test-only'); vi.stubEnv('POSE_PROVIDER', 'demo');
  vi.mocked(fetchImage).mockResolvedValue(await readFile('public/demo/base-runway.webp'));
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
async function setup() {
  const sid = await storage.create();
  const products = DEMO_GARMENTS.flatMap(demoProducts).map(p => ({ ...p, id: `test-${p.id}`, isDemo: false, imageUrl: 'https://test.example/garment.webp' }));
  await storage.update(sid, d => { products.forEach(p => { d.products[p.id] = p; }); });
  const person = await storage.putImage(sid, await readFile('public/demo/base-runway.webp'), 'person');
  const input = { personId: person.id, garments: DEMO_GARMENTS, productIds: products.filter(p => p.id.endsWith('-0') && ['top', 'bottom'].includes(p.category || '')).map(p => p.id), force: false };
  return { sid, input };
}
it('applies bottoms then tops, preserves personal pose, and reuses only the unchanged lower layer after a top swap', async () => {
  const render = vi.spyOn(FashnHosted.prototype, 'render').mockResolvedValue(await readFile('public/demo/silver-runway.webp'));
  const { sid, input } = await setup();
  const task = await queueTryon(sid, input); await task.run();
  expect(render.mock.calls.map(([i]) => i.category)).toEqual(['bottoms', 'tops']);
  const first = (await storage.read(sid)).jobs[task.job.id].result!;
  expect(first.isDemo).toBe(false); expect(first.pose).toBe('original'); expect(first.baseRenderId).toBe(first.id);
  await expect(queuePose(sid, first.id, 'peace')).rejects.toThrow('Pose editing is not configured');
  const swap = await queueTryon(sid, { ...input, productIds: input.productIds.map(id => id === 'test-fixture-demo-top-0' ? 'test-fixture-demo-top-1' : id) }); await swap.run();
  expect(render.mock.calls.map(([i]) => i.category)).toEqual(['bottoms', 'tops', 'tops']);
  expect((await storage.read(sid)).jobs[swap.job.id].status).toBe('completed');
});
it('keeps a failed top as a failed job and resumes using the successful bottom layer', async () => {
  const image = await readFile('public/demo/silver-runway.webp');
  const render = vi.spyOn(FashnHosted.prototype, 'render').mockResolvedValueOnce(image).mockRejectedValueOnce(new Error('simulated provider outage')).mockResolvedValueOnce(image);
  const { sid, input } = await setup();
  const failed = await queueTryon(sid, input); await failed.run();
  expect((await storage.read(sid)).jobs[failed.job.id].status).toBe('failed');
  expect((await storage.read(sid)).jobs[failed.job.id].result).toBeUndefined();
  const retry = await queueTryon(sid, input); await retry.run();
  expect(render.mock.calls.map(([i]) => i.category)).toEqual(['bottoms', 'tops', 'tops']);
  expect((await storage.read(sid)).jobs[retry.job.id].status).toBe('completed');
});
it('explicitly retries a top without paying to regenerate the unchanged bottom', async () => {
  const render = vi.spyOn(FashnHosted.prototype, 'render').mockResolvedValue(await readFile('public/demo/silver-runway.webp'));
  const { sid, input } = await setup();
  const first = await queueTryon(sid, input); await first.run();
  const retry = await queueTryon(sid, { ...input, retryGarmentId: 'demo-top' }); await retry.run();
  expect(render.mock.calls.map(([i]) => i.category)).toEqual(['bottoms', 'tops', 'tops']);
  expect((await storage.read(sid)).jobs[retry.job.id].result?.baseRenderId).not.toBe((await storage.read(sid)).jobs[first.job.id].result?.baseRenderId);
});
