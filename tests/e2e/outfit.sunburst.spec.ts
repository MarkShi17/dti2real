import { test, expect, waitJob } from './helpers';
import { defaultFilters } from '../../src/lib/schema';
import type { Garment, RenderResult } from '../../src/lib/schema';
import { readFile } from 'node:fs/promises';

test('default Sunburst sends every selected item in one edit and repeats every reference for poses', async ({ page, request }) => {
  const control = process.env.PLAYWRIGHT_SUNBURST_CONTROL_URL!;
  expect(control).toBeTruthy();
  expect((await request.post(`${control}/reset`, { data: {} })).ok()).toBe(true);
  expect((await page.request.post('/api/session')).ok()).toBe(true);
  const status = await (await page.request.get('/api/status')).json();
  expect(status.tryon.name).toBe('openai_outfit');
  expect(status.pose.name).toBe('openai_outfit');
  const upload = await page.request.post('/api/upload', { multipart: { kind: 'screenshot', file: { name: 'sample.webp', mimeType: 'image/webp', buffer: await readFile('public/demo/sample.webp') } } });
  expect(upload.ok()).toBe(true);
  const screenshot = await upload.json();
  const analyzed = await page.request.post('/api/analyze', { data: { imageId: screenshot.id } });
  expect(analyzed.ok()).toBe(true);
  const garments: Garment[] = (await analyzed.json()).garments;
  const productIds: string[] = [];
  for (const garment of garments) {
    const found = await page.request.post('/api/search', { data: { garment, filters: defaultFilters, imageId: screenshot.id } });
    expect(found.ok()).toBe(true);
    productIds.push((await found.json()).products[0].id);
  }
  const input = { personId: 'studio', screenshotId: screenshot.id, garments, productIds, force: false };
  const submitted = await page.request.post('/api/tryon', { data: input });
  expect(submitted.ok(), await submitted.text()).toBe(true);
  const done = await waitJob(page.request, await submitted.json());
  expect(done.status).toBe('completed');
  const result = done.result as RenderResult;
  expect(result.outfit!.promptMode).toBe('simple');
  expect(result.productIds).toEqual(productIds);
  expect(result.outfit!.references).toHaveLength(garments.length);
  expect(result.outfit!.reviews).toEqual([]);
  const cached = await (await page.request.post('/api/tryon', { data: input })).json();
  expect(cached.result.id).toBe(result.id);
  const pose = await page.request.post('/api/pose', { data: { renderId: result.id, pose: 'hip' } });
  expect(pose.ok(), await pose.text()).toBe(true);
  const posed = await waitJob(page.request, await pose.json());
  expect(posed.status).toBe('completed');
  expect((posed.result as RenderResult).productIds).toEqual(productIds);
  const calls = await (await request.get(`${control}/calls`)).json();
  const edits = calls.filter((c: { provider: string }) => c.provider === 'sunburst');
  expect(edits).toHaveLength(2);
  expect(edits.map((c: { imageCount: number }) => c.imageCount)).toEqual([1 + garments.length, 2 + garments.length]);
  for (const edit of edits) {
    expect(edit.model).toBe('gpt-image-2.5-sunburst');
    for (const garment of garments) expect(edit.prompt).toContain(garment.name);
  }
  expect(calls.some((c: { schema?: string }) => ['outfit_layering', 'outfit_quality'].includes(c.schema || ''))).toBe(false);
  expect(calls.some((c: { provider: string }) => c.provider === 'tryon-submit')).toBe(false);
});
