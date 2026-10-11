import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { DEMO_GARMENTS, demoProducts } from '../../src/lib/fixtures';
import { outfitSignature } from '../../src/lib/outfit';
import type { Garment } from '../../src/lib/schema';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
const providers = Object.fromEntries(['vision', 'shopping', 'tryon', 'pose', 'segmentation'].map(key => [key, { name: 'Demo', mode: 'demo', detail: 'Local sample' }]));
async function mockSession(page: Page) {
  await page.route('**/api/session', route => route.fulfill({ json: { images: {}, products: {}, renders: [], providers } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Explore an example', exact: true })).toBeEnabled();
}
async function showPanel(page: Page, info: TestInfo, step: number) {
  if (info.project.name.includes('mobile')) await page.getByRole('button', { name: ['1 Inspiration', '2 Find pieces', '3 Fitting room'][step], exact: true }).click();
}
async function mockAnalysis(page: Page, garments = DEMO_GARMENTS, wait = Promise.resolve()) {
  await page.route('**/api/analyze', async route => { await wait; await route.fulfill({ json: { garments, note: 'Hand-annotated sample', isDemo: true, provider: 'Sample annotations' } }); });
}
async function mockSearch(page: Page, wait: (garment: Garment) => Promise<void> = async () => {}) {
  await page.route('**/api/search', async route => {
    const { garment } = route.request().postDataJSON() as { garment: Garment };
    await wait(garment);
    await route.fulfill({ json: { products: demoProducts(garment), warnings: [], isDemo: true, queries: garment.searchQueries } });
  });
}

// Removing any state reporting call should break a browser-visible transition here.
test('progress spans analysis, queued search batches, user review, and the later try-on', async ({ page }, info) => {
  const analyzed = gate(), rest = gate(), render = gate(), polled = gate();
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSession(page); await mockAnalysis(page, DEMO_GARMENTS, analyzed.promise);
  await mockSearch(page, g => DEMO_GARMENTS.slice(0, 2).some(item => item.id === g.id) ? Promise.resolve() : rest.promise);
  const selected = Object.fromEntries(DEMO_GARMENTS.map(g => [g.id, demoProducts(g)[0].id]));
  const result = { id: 'preview-progress', baseRenderId: 'preview-progress', image: '/demo/silver-runway.webp', pose: 'runway', provider: 'Created studio sample', isDemo: true, note: 'Sample preview', createdAt: new Date().toISOString(), personId: 'studio', productIds: Object.values(selected), outfitKey: outfitSignature('studio', selected, DEMO_GARMENTS) };
  await page.route('**/api/tryon', route => route.fulfill({ json: { id: 'progress-job', status: 'queued', progress: 'Preparing your wardrobe', createdAt: Date.now(), key: 'progress' } }));
  await page.route('**/api/jobs/progress-job', async route => { polled.release(); await render.promise; await route.fulfill({ json: { id: 'progress-job', status: 'completed', progress: 'Your preview is ready', result, createdAt: Date.now(), key: 'progress' } }); });
  try {
    await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
    const banner = page.getByRole('region', { name: 'Outfit progress' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    const animation = await banner.getByRole('progressbar').locator(':scope > span').first().evaluate(element => getComputedStyle(element, '::after').animationName);
    expect(animation).toBe('none');
    await page.clock.runFor(31000); await expect(banner).toContainText('Still waiting');
    await expect(banner.getByTestId('pipeline-elapsed')).toContainText('31s');
    analyzed.release();
    await expect(banner).toContainText('2 of 5 items checked');
    await expect(banner).not.toContainText('Choose your pieces');
    await banner.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('pipeline-search.png') });
    rest.release();
    await expect(banner).toContainText('5 matched');
    await expect(banner).toContainText('Choose your pieces');
    await expect(banner.getByTestId('pipeline-elapsed')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(1);
    await showPanel(page, info, 2); await page.locator('.render-button').click();
    await expect(banner).toContainText('Preparing your wardrobe');
    await polled.promise;
    const bounds = await banner.boundingBox(); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    render.release(); await expect(banner).toContainText('Your preview is ready');
    await expect(banner.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
    await page.clock.runFor(3100); await expect(banner).toHaveCount(0);
    await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/silver-runway.webp');
  } finally { analyzed.release(); rest.release(); render.release(); }
});

test('partial failures keep successful products usable and a retry refreshes the outcome counts', async ({ page }, info) => {
  await mockSession(page); await mockAnalysis(page, DEMO_GARMENTS.slice(0, 3));
  let failed = true;
  await page.route('**/api/search', async route => {
    const { garment } = route.request().postDataJSON() as { garment: Garment };
    if (garment.id === DEMO_GARMENTS[1].id && failed) await route.fulfill({ status: 502, json: { error: 'Shopping unavailable for this item' } });
    else await route.fulfill({ json: { products: garment.id === DEMO_GARMENTS[2].id ? [] : demoProducts(garment), warnings: [], isDemo: true } });
  });
  await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  const banner = page.getByRole('region', { name: 'Outfit progress' });
  await expect(banner).toContainText('1 matched'); await expect(banner).toContainText('1 without matches'); await expect(banner).toContainText('1 failed');
  await expect(banner).toContainText('Search again');
  await showPanel(page, info, 1);
  await expect(page.getByRole('button', { name: `Select ${demoProducts(DEMO_GARMENTS[0])[0].title}`, exact: true })).toBeEnabled();
  failed = false;
  await page.getByRole('tab', { name: DEMO_GARMENTS[1].category, exact: true }).click();
  await page.getByRole('button', { name: `Search again for ${DEMO_GARMENTS[1].name}`, exact: true }).click();
  await expect(banner).toContainText('2 matched'); await expect(banner).not.toContainText('1 failed');
});

test('session deletion clears progress and an old analysis cannot bring it back', async ({ page }) => {
  const analyzed = gate();
  await mockSession(page); await mockAnalysis(page, DEMO_GARMENTS, analyzed.promise); await mockSearch(page);
  try {
    await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Outfit progress' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete my session', exact: true }).click();
    await page.getByRole('button', { name: 'Delete session', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Outfit progress' })).toHaveCount(0);
    analyzed.release(); await page.unrouteAll({ behavior: 'wait' });
    await expect(page.getByRole('region', { name: 'Outfit progress' })).toHaveCount(0);
    await expect(page.locator('.garment-row')).toHaveCount(0);
  } finally { analyzed.release(); }
});

test('manual mode never pretends recognition or product matching is running', async ({ page }) => {
  const analyzed = gate();
  await mockSession(page); await mockAnalysis(page, [], analyzed.promise);
  await page.route('**/api/upload', route => route.fulfill({ json: { id: '00000000-0000-4000-8000-000000000001', url: '/demo/sample.webp', width: 900, height: 1200, hash: 'manual-source', kind: 'screenshot' } }));
  try {
    await page.getByLabel('Outfit screenshot file').setInputFiles('public/demo/sample.webp');
    await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
    const banner = page.getByRole('region', { name: 'Outfit progress' });
    await expect(banner).toContainText('Checking your outfit setup');
    await expect(banner).not.toContainText('Identifying & separating items');
    analyzed.release();
    await expect(banner).toContainText('Add items manually');
    await expect(banner.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await expect(banner.getByTestId('pipeline-elapsed')).toHaveCount(0);
  } finally { analyzed.release(); }
});

test('editing a queued garment cannot leave progress stuck between batches', async ({ page }, info) => {
  const firstBatch = gate();
  await mockSession(page); await mockAnalysis(page, DEMO_GARMENTS.slice(0, 3));
  await mockSearch(page, g => g.id === DEMO_GARMENTS[0].id ? firstBatch.promise : Promise.resolve());
  try {
    await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
    const banner = page.getByRole('region', { name: 'Outfit progress' });
    await expect(banner).toContainText('1 of 3 items checked');
    await showPanel(page, info, 0);
    await page.getByRole('button', { name: `Hide ${DEMO_GARMENTS[2].name}`, exact: true }).click();
    firstBatch.release();
    await expect(banner).toContainText('2 matched'); await expect(banner).toContainText('1 changed');
    await expect(banner).toContainText('Choose your pieces');
    await expect(banner.getByTestId('pipeline-elapsed')).toHaveCount(0);
  } finally { firstBatch.release(); }
});

test('analysis failure stops progress and a fresh analysis recovers', async ({ page }) => {
  await mockSession(page); await mockSearch(page);
  let failed = true;
  await page.route('**/api/analyze', async route => {
    if (failed) await route.fulfill({ status: 502, json: { error: 'Recognition unavailable' } });
    else await route.fulfill({ json: { garments: DEMO_GARMENTS, note: 'Sample annotations', isDemo: true } });
  });
  await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  const banner = page.getByRole('region', { name: 'Outfit progress' });
  await expect(banner).toHaveAttribute('data-phase', 'failed');
  await expect(banner).toContainText('Recognition unavailable');
  await expect(banner.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(banner.getByTestId('pipeline-elapsed')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  await expect(banner).toHaveAttribute('data-phase', 'review'); await expect(banner).toContainText('5 matched');
});

test('a failed try-on preserves match progress and cached recovery completes immediately', async ({ page }, info) => {
  await mockSession(page); await mockAnalysis(page); await mockSearch(page);
  const selected = Object.fromEntries(DEMO_GARMENTS.map(g => [g.id, demoProducts(g)[0].id]));
  const result = { id: 'cached-preview', baseRenderId: 'cached-preview', image: '/demo/silver-runway.webp', pose: 'runway', provider: 'Created studio sample', isDemo: true, note: 'Sample preview', createdAt: new Date().toISOString(), personId: 'studio', productIds: Object.values(selected), outfitKey: outfitSignature('studio', selected, DEMO_GARMENTS) };
  let failed = true;
  await page.route('**/api/tryon', route => route.fulfill({ json: { id: 'cached-job', status: failed ? 'failed' : 'completed', progress: failed ? 'Render stopped' : 'Loaded cached preview', error: failed ? 'Render interrupted' : undefined, result: failed ? undefined : result, createdAt: Date.now(), key: 'cached' } }));
  await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  const banner = page.getByRole('region', { name: 'Outfit progress' });
  await expect(banner).toHaveAttribute('data-phase', 'review');
  await showPanel(page, info, 2); await page.locator('.render-button').click();
  await expect(banner).toHaveAttribute('data-phase', 'failed');
  await expect(banner).toContainText('Render interrupted');
  await expect(banner.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  await expect(banner.getByTestId('pipeline-elapsed')).toHaveCount(0);
  failed = false;
  await page.locator('.render-button').click();
  await expect(banner).toHaveAttribute('data-phase', 'complete');
  await expect(banner.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
});
