// Opt-in real provider evaluation. This can incur vision/shopping charges.
// Usage: LIVE_EVALUATION=1 node scripts/evaluate-vision.mjs docs/dti_example/fit10.webp
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
if (process.env.LIVE_EVALUATION !== '1') throw new Error('Set LIVE_EVALUATION=1 to authorize calls to your configured providers.');
const file = process.argv[2];
if (!file) throw new Error('Supply a PNG, JPEG or WebP screenshot path.');
const base = process.env.EVALUATION_BASE_URL || 'http://127.0.0.1:3212';
const output = process.env.EVALUATION_OUTPUT || '.cache/live-vision';
await mkdir(output, { recursive: true, mode: 0o700 });
const session = await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: base } });
assert.equal(session.status, 200);
const cookie = session.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const { providers } = await session.json();
assert.equal(providers.vision.mode, 'live', 'Vision is not configured.');
const started = Date.now();
async function call(path, payload) {
 const response = await fetch(`${base}/api/${path}`, { method: 'POST', headers: { Origin: base, Cookie: cookie, ...(payload instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: payload instanceof FormData ? payload : JSON.stringify(payload) });
 const data = await response.json(); if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${data.error}`); return data;
}
try {
 const type = extname(file).toLowerCase() === '.png' ? 'image/png' : /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/webp';
 const form = new FormData(); form.set('file', new Blob([await readFile(file)], { type }), basename(file)); form.set('kind', 'screenshot');
 const uploaded = await call('upload', form), result = await call('analyze', { imageId: uploaded.id });
 assert.equal(result.isDemo, false, 'Evaluation must not use demo annotations.');
 assert.ok(result.garments.length, 'No garments returned.');
 const report = { input: basename(file), at: new Date().toISOString(), seconds: (Date.now() - started) / 1000, provider: result.provider, note: result.note, garments: [] };
 for (let i = 0; i < result.garments.length; i++) {
  const g = result.garments[i], mask = g.segmentation;
  const record = { name: g.name, category: g.category, colors: g.attributes.color, bbox: g.bbox, hasMask: !!mask };
  if (mask) {
   const path = `/api/assets/${mask.imageId}`;
   const response = await fetch(`${base}${path}`, { headers: { Cookie: cookie } }); assert.equal(response.status, 200);
   assert.equal((await fetch(`${base}${path}`)).status, 401, 'Masks must be private.');
   const artifact = `mask-${i}-${g.category}.webp`; await writeFile(join(output, artifact), Buffer.from(await response.arrayBuffer()));
   Object.assign(record, { artifact, estimatedMaskScore: mask.score, model: mask.model });
  }
  report.garments.push(record);
 }
 if (process.env.EVALUATE_SHOPPING === '1') {
  const shopping = await call('search', { garment: result.garments[0], imageId: uploaded.id, filters: { marketplaces: [], secondhandOnly: false, sortBy: 'best_match' } });
  assert.equal(shopping.isDemo, false); assert.ok(shopping.products.length, 'No real listings returned.');
  report.shopping = { count: shopping.products.length, warnings: shopping.warnings, products: shopping.products };
 }
 await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
 console.log(`Verified ${result.garments.length} recognized pieces; ${report.garments.filter(g => g.hasMask).length} private masks.`);
 console.log(`Inspect actual mask quality in ${output}/report.json. This is a smoke evaluation, not a measured accuracy benchmark.`);
} finally { await fetch(`${base}/api/session`, { method: 'DELETE', headers: { Origin: base, Cookie: cookie } }); }
