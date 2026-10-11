import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { seed, waitJob, DEMO_GARMENTS, defaultFilters } from './helpers';

test('private routes require a session and provider status discloses no credentials', async ({ request }) => {
  for (const endpoint of ['session', 'assets/00000000-0000-4000-8000-000000000000', 'jobs/00000000-0000-4000-8000-000000000000']) expect((await request.get(`/api/${endpoint}`)).status()).toBe(401);
  for (const endpoint of ['analyze', 'search', 'tryon', 'pose', 'export', 'upload']) expect((await request.post(`/api/${endpoint}`, { data: {} })).status()).toBe(401);
  const status = await request.get('/api/status'); expect(status.status()).toBe(200);
  expect(await status.text()).not.toMatch(/sk-|Bearer |api_key|API_KEY/);
});
test('session cookie is HttpOnly, SameSite Strict, and private responses are not cached', async ({ request }) => {
  const response = await request.post('/api/session'); expect(response.status()).toBe(200);
  const cookie = response.headers()['set-cookie']; expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/SameSite=strict/i); expect(cookie).toMatch(/Path=\//i);
  expect((await request.get('/api/session')).headers()['cache-control']).toContain('no-store');
});
test('foreign and null origins cannot create, modify, or delete sessions', async ({ request }) => {
  for (const origin of ['https://attacker.example', 'null']) expect((await request.post('/api/session', { headers: { origin } })).status()).toBe(403);
  await request.post('/api/session');
  expect((await request.patch('/api/session', { headers: { origin: 'https://attacker.example' }, data: {} })).status()).toBe(403);
  expect((await request.delete('/api/session', { headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403);
  expect((await request.get('/api/session')).status()).toBe(200);
});
test('unknown job IDs and prototype names return a bounded 404', async ({ request }) => {
  await request.post('/api/session');
  for (const id of ['__proto__', 'constructor', 'not-a-uuid', '00000000-0000-4000-8000-000000000000']) expect((await request.get(`/api/jobs/${id}`)).status()).toBe(404);
});
test('mutations reject malformed JSON, unexpected content type, and oversized bodies', async ({ request }) => {
  await request.post('/api/session');
  expect((await request.post('/api/analyze', { headers: { 'content-type': 'application/json' }, data: '{broken' })).status()).toBe(400);
  expect((await request.post('/api/analyze', { headers: { 'content-type': 'text/plain' }, data: '{}' })).status()).toBe(400);
  expect((await request.patch('/api/session', { data: { padding: 'x'.repeat(500100) } })).status()).toBe(413);
});
test('search validates category, region numbers, queries, and prices', async ({ request }) => {
  await request.post('/api/session');
  for (const data of [
    { garment: { ...DEMO_GARMENTS[0], category: 'skin' }, filters: defaultFilters },
    { garment: { ...DEMO_GARMENTS[0], bbox: { x: 'bad', y: 0, w: 1, h: 1 } }, filters: defaultFilters },
    { garment: { ...DEMO_GARMENTS[0], searchQueries: ['x'.repeat(251)] }, filters: defaultFilters },
    { garment: DEMO_GARMENTS[0], filters: { ...defaultFilters, priceMax: -1 } },
  ]) expect((await request.post('/api/search', { data })).status()).toBe(400);
});
test('uploads enforce consent and reject corrupt, SVG, tiny and oversized inputs', async ({ request }) => {
  await request.post('/api/session'); const valid = await readFile('public/demo/base-runway.webp');
  expect((await request.post('/api/upload', { multipart: { kind: 'person', file: { name: 'person.webp', mimeType: 'image/webp', buffer: valid } } })).status()).toBe(400);
  const files = [
    { buffer: Buffer.from('broken'), name: 'corrupt.png', mimeType: 'image/png', code: 400 },
    { buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"/>'), name: 'vector.svg', mimeType: 'image/svg+xml', code: 400 },
    { buffer: await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } }).png().toBuffer(), name: 'tiny.png', mimeType: 'image/png', code: 400 },
    { buffer: Buffer.alloc(8 * 1024 * 1024 + 30000), name: 'large.jpg', mimeType: 'image/jpeg', code: 413 },
    { buffer: await sharp({ create: { width: 5000, height: 5000, channels: 3, background: 'white' } }).png().toBuffer(), name: 'pixels.png', mimeType: 'image/png', code: 400 },
  ];
  for (const file of files) expect((await request.post('/api/upload', { multipart: { kind: 'screenshot', file } })).status()).toBe(file.code);
  expect(Object.keys((await (await request.get('/api/session')).json()).images)).toHaveLength(0);
});
test('upload normalizes orientation and strips metadata while maintaining private access', async ({ request, playwright, baseURL }) => {
  await request.post('/api/session');
  const input = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#aabbcc' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const response = await request.post('/api/upload', { multipart: { kind: 'person', consent: 'true', file: { name: 'person.jpg', mimeType: 'image/jpeg', buffer: input } } }); expect(response.status()).toBe(201);
  const ref = await response.json(); expect(ref.width).toBe(200); expect(ref.height).toBe(100);
  const asset = await request.get(ref.url); expect(asset.status()).toBe(200); expect(asset.headers()['cache-control']).toContain('private');
  const metadata = await sharp(await asset.body()).metadata(); expect(metadata.format).toBe('webp'); expect(metadata.exif).toBeUndefined();
  const stranger = await playwright.request.newContext({ baseURL });
  try { await stranger.post('/api/session'); expect((await stranger.get(ref.url)).status()).toBe(404); } finally { await stranger.dispose(); }
  await request.delete('/api/session'); expect((await request.get(ref.url)).status()).toBe(401);
});
test('try-on rejects forged products, unsupported demo combinations and hidden selections', async ({ request }) => {
  const state = await seed(request); const input = { personId: 'studio', garments: DEMO_GARMENTS, productIds: Object.values(state.selected) };
  expect((await request.post('/api/tryon', { data: { ...input, productIds: ['https://127.0.0.1/secret'] } })).status()).toBe(400);
  expect((await request.post('/api/tryon', { data: { ...input, productIds: ['fixture-demo-top-1', 'fixture-demo-bottom-0'] } })).status()).toBe(422);
  expect((await request.post('/api/tryon', { data: { ...input, garments: DEMO_GARMENTS.map(g => ({ ...g, visible: false })) } })).status()).toBe(400);
  expect((await request.post('/api/tryon', { data: { ...input, retryGarmentId: 'demo-bag' } })).status()).toBe(400);
});
test('real HTTP rendering caches a completed result and exports valid linked SVG and PNG bytes', async ({ request }, info) => {
  const state = await seed(request); const input = { personId: 'studio', garments: DEMO_GARMENTS, productIds: Object.values(state.selected) };
  const first = await waitJob(request, await (await request.post('/api/tryon', { data: input })).json());
  expect(first.status).toBe('completed'); const result = first.result as { id: string; image: string };
  const cached = await (await request.post('/api/tryon', { data: input })).json(); expect(cached.status).toBe('completed'); expect(cached.result.id).toBe(result.id);
  for (const format of ['svg', 'png']) {
    const response = await request.post('/api/export', { data: { screenshotId: 'sample', renderId: result.id, format } }); expect(response.status()).toBe(200);
    expect(response.headers()['content-disposition']).toContain(`.${format}`);
    if (format === 'svg') { const svg = await response.text(); expect(svg).toContain('SAMPLE PREVIEW'); expect(svg).toContain('https://www.google.com/search'); expect(svg).not.toContain('Sample $'); expect(svg).toContain('data:image/png;base64,'); }
    else {
      const image = await response.body(), meta = await sharp(image).metadata(); expect(meta.format).toBe('png'); expect(meta.width).toBe(1200);
      // A valid PNG can still lose every text label when container fonts are absent.
      const header = await sharp(image).extract({ left: 40, top: 25, width: 500, height: 120 }).stats();
      expect(header.channels[0].stdev, 'Export header must contain rasterized text, not just a flat background').toBeGreaterThan(1);
      // Fontless containers draw tiny tofu boxes instead of the 40px wordmark.
      // Validate its actual ink bounds; mere pixel variance would accept those boxes.
      const { data: pixels, info: raster } = await sharp(image).extract({ left: 40, top: 20, width: 300, height: 60 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const xs: number[] = [], ys: number[] = [];
      for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
        if (pixels[(y * raster.width + x) * raster.channels] > 150) { xs.push(x); ys.push(y); }
      }
      expect(Math.max(...xs) - Math.min(...xs), 'Wordmark must have full-size font glyphs').toBeGreaterThan(130);
      expect(Math.max(...ys) - Math.min(...ys), 'Wordmark must not render as missing-font boxes').toBeGreaterThan(24);
      await info.attach('export-card', { body: image, contentType: 'image/png' });
    }
  }
});
test('another session cannot pose or export someone else’s completed render', async ({ request, playwright, baseURL }) => {
  const state = await seed(request); const job = await waitJob(request, await (await request.post('/api/tryon', { data: { personId: 'studio', garments: DEMO_GARMENTS, productIds: Object.values(state.selected) } })).json());
  const id = (job.result as { id: string }).id, stranger = await playwright.request.newContext({ baseURL });
  try {
    await stranger.post('/api/session');
    expect((await stranger.post('/api/pose', { data: { renderId: id, pose: 'peace' } })).status()).toBe(404);
    expect((await stranger.post('/api/export', { data: { screenshotId: 'sample', renderId: id, format: 'png' } })).status()).toBe(400);
  } finally { await stranger.dispose(); }
});
test('expensive request limit rejects the 21st call without disabling other sessions', async ({ request, playwright, baseURL }) => {
  await request.post('/api/session');
  for (let i = 0; i < 20; i++) expect((await request.post('/api/analyze', { data: { imageId: 'invalid' } })).status()).toBe(400);
  expect((await request.post('/api/analyze', { data: { imageId: 'sample' } })).status()).toBe(429);
  expect((await request.get('/api/session')).status()).toBe(200);
  const other = await playwright.request.newContext({ baseURL });
  try { await other.post('/api/session'); expect((await other.post('/api/analyze', { data: { imageId: 'sample' } })).status()).toBe(200); } finally { await other.dispose(); }
});
