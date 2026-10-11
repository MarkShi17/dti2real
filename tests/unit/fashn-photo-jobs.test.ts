import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storage } from '@/lib/storage';
import { queueTryon } from '@/lib/jobs';
import { DEMO_GARMENTS, demoProducts } from '@/lib/fixtures';
import { FashnLocal } from '@/lib/providers/tryon';
import { fetchImage } from '@/lib/security';

vi.mock('@/lib/security', async original => ({ ...await original<typeof import('@/lib/security')>(), fetchImage: vi.fn() }));
vi.mock('@/lib/providers/readiness', () => ({ providerReadiness: vi.fn(async () => ({ tryon: { ready: true } })) }));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dti-fashn-photo-'));
  vi.stubEnv('DATA_DIR', root); vi.stubEnv('DEMO_MODE', 'false'); vi.stubEnv('TRYON_PROVIDER', 'fashn_local');
  vi.stubEnv('FASHN_LOCAL_URL', 'http://127.0.0.1:8080'); vi.stubEnv('FASHN_LOCAL_TOKEN', 'test');
  vi.mocked(fetchImage).mockResolvedValue(await readFile('public/demo/base-runway.webp'));
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

it('rejects a FASHN outfit that would silently omit selected shoes, jewelry and a belt', async () => {
  const sid = await storage.create();
  const garments = [...DEMO_GARMENTS, { ...DEMO_GARMENTS[0], id: 'selected-belt', name: 'Black waist belt', category: 'other' as const }];
  const products = garments.map(g => ({ ...demoProducts(g)[0], id: `real-${g.id}`, garmentId: g.id, isDemo: false, imageUrl: `https://retailer.example/${g.id}.webp` }));
  await storage.update(sid, d => { products.forEach(p => { d.products[p.id] = p; }); });
  const render = vi.spyOn(FashnLocal.prototype, 'render');
  await expect(queueTryon(sid, { personId: 'studio', garments, productIds: products.map(p => p.id), force: false })).rejects.toThrow(/complete outfit|cannot render/i);
  expect(render).not.toHaveBeenCalled();
});
