import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { DEMO_GARMENTS, demoProducts, POSES } from '../../src/lib/fixtures';
import { outfitSignature } from '../../src/lib/outfit';
import type { Garment, RenderResult } from '../../src/lib/schema';

const providers = Object.fromEntries(['vision', 'shopping', 'tryon', 'pose', 'segmentation'].map(key => [key, { name: ['tryon', 'pose'].includes(key) ? 'openai_outfit' : 'test-provider', mode: 'live', ready: true, detail: 'Explicit browser fixture' }]));
const products = DEMO_GARMENTS.map(g => ({ ...demoProducts(g)[0], id: `real-${g.id}`, isDemo: false }));
const selected = Object.fromEntries(products.map(p => [p.garmentId, p.id]));
function accepted(pose: RenderResult['pose'] = 'runway', faceId?: string): RenderResult {
  return { id: '00000000-0000-4000-8000-000000000001', baseRenderId: '00000000-0000-4000-8000-000000000001', image: '/demo/silver-runway.webp', pose, provider: 'openai_outfit', isDemo: false, note: 'Passed quality review', personId: 'studio', productIds: Object.values(selected), outfitKey: outfitSignature('studio', selected, DEMO_GARMENTS, { screenshotId: 'sample', faceId }), createdAt: new Date().toISOString() };
}
async function setup(page: Page, opts: { selected?: Record<string, string>; render?: RenderResult; face?: boolean } = {}) {
  const face = { id: '00000000-0000-4000-8000-000000000002', url: '/demo/base-runway.webp', kind: 'face', hash: 'face', width: 900, height: 1200 };
  let state: Record<string, unknown> = { screenshotId: 'sample', personId: 'studio', garments: DEMO_GARMENTS, selected: opts.selected || selected, activeId: DEMO_GARMENTS[0].id, renderId: opts.render?.id || null, faceId: opts.face ? face.id : null, view: 'photo' };
  const renders = opts.render ? [opts.render] : [];
  await page.route('**/api/session', async route => {
    if (route.request().method() === 'PATCH') state = route.request().postDataJSON();
    await route.fulfill({ json: { state, providers, images: opts.face ? { [face.id]: face } : {}, products: Object.fromEntries(products.map(p => [p.id, p])), renders } });
  });
  await page.route('**/api/status', route => route.fulfill({ json: providers }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Explore an example', exact: true })).toBeEnabled();
  return { renders, face, state: () => state };
}
async function panel(page: Page, info: TestInfo, step: number) {
  if (info.project.name.includes('mobile')) await page.getByRole('button', { name: ['1 Inspiration', '2 Find pieces', '3 Fitting room'][step], exact: true }).click();
}
test('requires shoes, bag and jewelry, then excludes a hidden piece', async ({ page }, info) => {
  await setup(page, { selected: Object.fromEntries(products.slice(0, 2).map(p => [p.garmentId, p.id])) });
  await panel(page, info, 2);
  await expect(page.getByTestId('wardrobe-placeholder')).toBeVisible();
  await expect(page.getByTestId('wardrobe-image')).toHaveCount(0);
  await expect(page.locator('.pose-rail img')).toHaveCount(0);
  await expect(page.locator('.render-button')).toBeDisabled();
  for (const g of DEMO_GARMENTS.slice(2)) await expect(page.locator('.missing-selections')).toContainText(g.name);
  await panel(page, info, 1);
  for (const g of DEMO_GARMENTS.slice(2)) {
    await page.getByRole('tab', { name: g.category, exact: true }).click();
    await page.getByRole('button', { name: `Select ${products.find(p => p.garmentId === g.id)!.title}`, exact: true }).click();
  }
  await panel(page, info, 2); await expect(page.locator('.render-button')).toBeEnabled();
  await expect(page.getByTestId('wardrobe-image')).toHaveCount(0);
  await panel(page, info, 0); await page.getByRole('button', { name: 'Hide City ankle boots', exact: true }).click();
  await panel(page, info, 2); await expect(page.locator('.render-button')).toBeEnabled();
  let payload: { garments: Garment[]; productIds: string[] } | undefined;
  await page.route('**/api/tryon', async route => { payload = route.request().postDataJSON(); await route.fulfill({ status: 422, json: { error: 'Explicit test rejection' } }); });
  await page.locator('.render-button').click();
  await expect.poll(() => payload?.productIds.length).toBe(4);
  expect(payload?.productIds).not.toContain('real-demo-shoes');
});
test('sends identity and screenshot, reviews progress, preserves a failed preview, poses and reloads', async ({ page }, info) => {
  const faceId = '00000000-0000-4000-8000-000000000002';
  const first = accepted('runway', faceId);
  const session = await setup(page, { render: first, face: true });
  let failed = false;
  await page.route('**/api/tryon', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ screenshotId: 'sample', faceId, productIds: Object.values(selected) });
    await route.fulfill({ json: failed ? { status: 'failed', error: 'Floating bag remained after two repairs' } : { id: 'reviewed-job', status: 'queued', progress: 'Analyzing original outfit layering' } });
  });
  let polls = 0;
  await page.route('**/api/jobs/reviewed-job', async route => {
    polls++;
    await route.fulfill({ json: polls < 3 ? { id: 'reviewed-job', status: 'running', progress: polls === 1 ? 'Generating complete outfit' : 'Reviewing every product, layering and identity' } : { status: 'completed', result: first } });
  });
  await panel(page, info, 2); await page.locator('.render-button').click();
  await expect(page.locator('.rendering-overlay')).toContainText('Analyzing original outfit layering');
  await expect(page.locator('.rendering-overlay')).toContainText('Reviewing every product');
  await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeEnabled();
  failed = true; await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Floating bag' })).toBeVisible();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', first.image);
  await page.route('**/api/pose', async route => {
    const { pose } = route.request().postDataJSON();
    expect(route.request().postDataJSON().faceId).toBe(faceId);
    const result = { ...first, id: `00000000-0000-4000-8000-00000000000${session.renders.length + 2}`, pose, image: `/demo/silver-${pose}.webp` };
    session.renders.push(result);
    await route.fulfill({ json: { status: 'completed', result } });
  });
  for (const { name, id: pose } of [...POSES.slice(1), POSES[0]]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', `/demo/silver-${pose}.webp`);
  }
  await expect.poll(() => session.state().renderId).toBe(session.renders.at(-1)!.id);
  await page.reload(); await panel(page, info, 2);
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/silver-runway.webp');
});
test('a selection changed during a job cannot replace the last accepted preview', async ({ page }, info) => {
  const first = accepted(); await setup(page, { render: first });
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  await page.route('**/api/tryon', route => route.fulfill({ json: { id: 'slow-job', status: 'queued', progress: 'Reviewing every product' } }));
  await page.route('**/api/jobs/slow-job', async route => { await gate; await route.fulfill({ json: { status: 'completed', result: { ...first, id: '00000000-0000-4000-8000-000000000009', image: '/demo/burgundy-runway.webp' } } }); });
  try {
    await panel(page, info, 2); await page.locator('.render-button').click();
    await expect(page.locator('.rendering-overlay')).toBeVisible();
    await panel(page, info, 1); await page.getByRole('button', { name: `Remove ${products[3].title}`, exact: true }).click();
    release(); await panel(page, info, 2);
    await expect(page.locator('.stale-note')).toBeVisible();
    await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', first.image);
  } finally { release(); }
});
