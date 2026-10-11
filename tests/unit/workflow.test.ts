import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { storage } from '@/lib/storage';
import { queueTryon, queuePose } from '@/lib/jobs';
import { DEMO_GARMENTS, demoProducts } from '@/lib/fixtures';
import { defaultFilters } from '@/lib/schema';
import { POST as analyze } from '@/app/api/analyze/route';
import { POST as search } from '@/app/api/search/route';
import { POST as exportCard } from '@/app/api/export/route';
import { POST as upload } from '@/app/api/upload/route';
import { normalizeImage } from '@/lib/images';

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'dti2irl-tests-')); vi.stubEnv('DATA_DIR', root); vi.stubEnv('DEMO_MODE', 'true'); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
function req(path: string, sid: string, data: unknown) { return new NextRequest(`http://localhost/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: `dti2irl-session=${sid}` }, body: JSON.stringify(data) }); }
async function seed() { const sid = await storage.create(); await storage.update(sid, d => { DEMO_GARMENTS.flatMap(demoProducts).forEach(p => { d.products[p.id] = p; }); }); return sid; }
const selected = DEMO_GARMENTS.map(g => demoProducts(g)[0].id);

describe('complete server workflow without network credentials', () => {
  it('analyzes, retrieves all five garments, renders, poses, swaps skirt and exports linked SVG and PNG', async () => {
    const sid = await seed();
    const analysis = await analyze(req('analyze', sid, { imageId: 'sample' })); expect(analysis.status).toBe(200); expect((await analysis.json()).garments).toHaveLength(5);
    for (const garment of DEMO_GARMENTS) { const res = await search(req('search', sid, { garment, filters: defaultFilters })); expect(res.status).toBe(200); expect((await res.json()).products).toHaveLength(3); }
    const task = await queueTryon(sid, { personId: 'studio', garments: DEMO_GARMENTS, productIds: selected, force: false }); await task.run();
    const data = await storage.read(sid), result = data.jobs[task.job.id].result!; expect(result.image).toBe('/demo/silver-runway.webp'); expect(result.isDemo).toBe(true);
    const paths = new Set([result.image]);
    for (const pose of ['hip','peace','shoulder','lean'] as const) { const poseTask = await queuePose(sid, result.id, pose); await poseTask.run(); const r = (await storage.read(sid)).jobs[poseTask.job.id].result!; paths.add(r.image); expect(r.baseRenderId).toBe(result.id); }
    expect(paths.size).toBe(5);
    const second = await queueTryon(sid, { personId: 'studio', garments: DEMO_GARMENTS, productIds: selected.map(id => id === 'fixture-demo-bottom-0' ? 'fixture-demo-bottom-1' : id), force: false }); await second.run();
    expect((await storage.read(sid)).jobs[second.job.id].result?.image).toBe('/demo/burgundy-runway.webp');
    const svg = await exportCard(req('export', sid, { screenshotId: 'sample', renderId: result.id, format: 'svg' })); expect(svg.status).toBe(200); const content = await svg.text(); expect(content).toContain('SAMPLE PREVIEW'); expect(content).toContain('https://www.google.com/search?tbm=shop'); expect(content).not.toContain('Sample $');
    const png = await exportCard(req('export', sid, { screenshotId: 'sample', renderId: result.id, format: 'png' })); expect(png.status).toBe(200); expect(png.headers.get('Content-Type')).toBe('image/png'); expect((await png.arrayBuffer()).byteLength).toBeGreaterThan(10000);
  });
  it('deduplicates in-flight renders and returns cached completed results', async () => {
    const sid = await seed(), input = { personId: 'studio', garments: DEMO_GARMENTS, productIds: selected, force: false };
    const [a,b] = await Promise.all([queueTryon(sid, input), queueTryon(sid, input)]); expect(a.job.id).toBe(b.job.id); await Promise.all([a.run(), b.run()]);
    const cached = await queueTryon(sid, input); expect(cached.job.status).toBe('completed'); expect(cached.job.result?.id).toBe((await storage.read(sid)).jobs[a.job.id].result?.id);
  });
  it('does not substitute a studio sample for a consenting uploaded person', async () => {
    const sid = await seed(), image = await storage.putImage(sid, await readFile('public/demo/base-runway.webp'), 'person');
    await expect(queueTryon(sid, { personId: image.id, garments: DEMO_GARMENTS, productIds: selected, force: false })).rejects.toThrow('Personal-photo try-on needs');
  });
  it('requires consent before storing a person photo', async () => {
    const sid = await seed(), form = new FormData(); form.set('kind','person'); form.set('file', new File([await readFile('public/demo/base-runway.webp')], 'model.webp', { type: 'image/webp' }));
    const r = await upload(new NextRequest('http://localhost/api/upload', { method: 'POST', headers: { cookie: `dti2irl-session=${sid}` }, body: form })); expect(r.status).toBe(400); expect(Object.keys((await storage.read(sid)).images)).toHaveLength(0);
  });
  it('keeps an arbitrary uploaded screenshot in manual mode without a vision key', async () => {
    const sid = await seed(), image = await storage.putImage(sid, await readFile('public/demo/sample.webp'), 'screenshot');
    const res = await analyze(req('analyze', sid, { imageId: image.id })); const data = await res.json(); expect(data.garments).toEqual([]); expect(data.note).toContain('manual');
  });
});
describe('private image lifecycle', () => {
  it('rejects cross-session image access and deletes all cached data', async () => {
    const a = await storage.create(), b = await storage.create(); const ref = await storage.putImage(a, await readFile('public/demo/base-runway.webp'), 'person');
    await expect(storage.getImage(b, ref.id)).rejects.toThrow('not found'); await storage.delete(a); await expect(storage.getImage(a, ref.id)).rejects.toThrow('expired');
  });
  it('a queued job cannot recreate a deleted session', async () => {
    const sid = await seed(), task = await queueTryon(sid, { personId: 'studio', garments: DEMO_GARMENTS, productIds: selected, force: false }); await storage.delete(sid); await task.run(); await expect(storage.read(sid)).rejects.toThrow('expired');
  });
  it('rejects corrupt image payloads', async () => { await expect(normalizeImage(Buffer.from('not an image'))).rejects.toThrow('decoded'); });
});
