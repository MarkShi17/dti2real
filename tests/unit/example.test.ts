import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storage } from '@/lib/storage';
import { queuePose, queueTryon } from '@/lib/jobs';
import { EXAMPLE_GARMENTS, EXAMPLE_PRODUCTS, EXAMPLE_SOURCE_ID, exampleRender, isSupportedExampleOutfit } from '@/lib/examples';
import { COOKIE } from '@/lib/api';
import { POST as analyze } from '@/app/api/analyze/route';
import { POST as search } from '@/app/api/search/route';
import { POST as segment } from '@/app/api/segment/route';
import { NextRequest } from 'next/server';
import { garmentSchema } from '@/lib/schema';

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'dti-example-')); vi.stubEnv('DATA_DIR', root); vi.stubEnv('DEMO_MODE', 'false'); vi.stubEnv('TRYON_PROVIDER', 'fashn_api'); vi.stubEnv('FASHN_API_KEY', ''); vi.stubEnv('POSE_PROVIDER', 'fal'); vi.stubEnv('POSE_API_KEY', ''); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

it('defines the four precise canonical garments and accepts only their complete untouched selection', () => {
  expect(EXAMPLE_GARMENTS.map(g => [g.id, g.category])).toEqual([['example-top', 'top'], ['example-bottom', 'bottom'], ['example-bag', 'bag'], ['example-shoes', 'shoes']]);
  expect(EXAMPLE_GARMENTS[0].attributes.details?.join(' ')).toMatch(/left shoulder/i);
  expect(EXAMPLE_GARMENTS[2].attributes.details?.join(' ')).toMatch(/right hip/i);
  expect(isSupportedExampleOutfit(EXAMPLE_GARMENTS, EXAMPLE_PRODUCTS)).toBe(true);
  expect(isSupportedExampleOutfit([...EXAMPLE_GARMENTS].reverse().map(garment => garmentSchema.parse(garment)), EXAMPLE_PRODUCTS)).toBe(true);
  expect(isSupportedExampleOutfit(EXAMPLE_GARMENTS, EXAMPLE_PRODUCTS.map(p => ({ ...p, matchScore: 100, matchReason: 'Style score' })))).toBe(true);
  expect(isSupportedExampleOutfit(EXAMPLE_GARMENTS.slice(0, 3), EXAMPLE_PRODUCTS.slice(0, 3))).toBe(false);
  expect(isSupportedExampleOutfit(EXAMPLE_GARMENTS.map(g => ({ ...g, id: `edited-${g.id}` })), EXAMPLE_PRODUCTS)).toBe(false);
  expect(isSupportedExampleOutfit(EXAMPLE_GARMENTS.map(g => g.id === 'example-top' ? { ...g, name: 'Edited sweater' } : g), EXAMPLE_PRODUCTS)).toBe(false);
});

it('renders and poses the fixture without configured live providers, caches each pose, and never fetches providers', async () => {
  const sid = await storage.create();
  await storage.update(sid, d => { for (const product of EXAMPLE_PRODUCTS) d.products[product.id] = product; });
  const work = await queueTryon(sid, { personId: 'studio', screenshotId: EXAMPLE_SOURCE_ID, garments: EXAMPLE_GARMENTS, productIds: EXAMPLE_PRODUCTS.map(p => p.id), force: false });
  await work.run();
  const source = (await storage.read(sid)).jobs[work.job.id].result!;
  expect(source.isDemo).toBe(true); expect(source.exampleId).toBe('fitexample-v1');
  const images = new Set<string>();
  for (const pose of ['runway', 'hip', 'peace', 'shoulder', 'lean'] as const) {
    const task = await queuePose(sid, source.id, pose); await task.run();
    const result = (await storage.read(sid)).jobs[task.job.id].result!;
    images.add(result.image); expect(result.image).toBe(exampleRender(pose));
    expect((await queuePose(sid, source.id, pose)).job.status).toBe('completed');
  }
  expect(images.size).toBe(5);
  await expect(queueTryon(sid, { personId: 'studio', screenshotId: EXAMPLE_SOURCE_ID, garments: EXAMPLE_GARMENTS.slice(0, 3), productIds: EXAMPLE_PRODUCTS.slice(0, 3).map(p => p.id), force: false })).rejects.toThrow(/complete|four/i);
});

it('returns fixture annotations, listings, and regions before unavailable provider configuration can dispatch', async () => {
  const sid = await storage.create(), fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const headers = { 'Content-Type': 'application/json', Cookie: `${COOKIE}=${sid}` };
  const analyzeResponse = await analyze(new NextRequest('http://localhost/api/analyze', { method: 'POST', headers, body: JSON.stringify({ imageId: EXAMPLE_SOURCE_ID }) }));
  expect((await analyzeResponse.json()).garments).toEqual(EXAMPLE_GARMENTS);
  const searchResponse = await search(new NextRequest('http://localhost/api/search', { method: 'POST', headers, body: JSON.stringify({ imageId: EXAMPLE_SOURCE_ID, garment: EXAMPLE_GARMENTS[0], filters: { marketplaces: [], secondhandOnly: false, sortBy: 'best_match' } }) }));
  const searched = await searchResponse.json(); expect(searched.isDemo).toBe(true); expect(searched.strictMatching).toBe(false); expect(searched.products[0].id).toBe('example-top-0');
  const segmentResponse = await segment(new NextRequest('http://localhost/api/segment', { method: 'POST', headers, body: JSON.stringify({ imageId: EXAMPLE_SOURCE_ID, garments: EXAMPLE_GARMENTS }) }));
  expect((await segmentResponse.json()).garments).toEqual(EXAMPLE_GARMENTS);
  expect(fetcher).not.toHaveBeenCalled();
});
