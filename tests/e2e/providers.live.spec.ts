// The real production app/provider adapters run against explicit external transport fixtures.
// These tests prove integration behavior, not live AI quality or purchasable inventory.
import { test, expect, ready, gate, saved } from './helpers';
import type { Garment } from '@/lib/schema';
import type { APIRequestContext, Page } from '@playwright/test';
const control = process.env.PLAYWRIGHT_FIXTURE_CONTROL_URL;
async function configure(request: APIRequestContext, settings: Record<string, string>) {
  expect((await request.post(`${control}/config`, { data: settings })).ok()).toBe(true);
}
type Call = { provider: string; category?: string; model?: string; personHash?: string; imageCount?: number; schema?: string; filter?: string; market?: string; query?: string };
async function calls(request: APIRequestContext): Promise<Call[]> { return (await request.get(`${control}/calls`)).json(); }
async function analyze(page: Page) {
  await ready(page); await page.getByLabel('Outfit screenshot file').setInputFiles('public/demo/sample.webp');
  await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
  await expect(page.getByText('3 pieces in this look')).toBeVisible();
  await expect(page.locator('.render-button')).toBeEnabled();
  await expect(page.locator('.product-card').first()).toBeVisible();
}
async function generate(page: Page) {
  // Explicit legacy adapter contracts use only its supported core garments.
  await saved(page, state => Object.keys((state.selected || {}) as object).length === 3);
  const { state } = await (await page.request.get('/api/session')).json();
  const hasDress = state.garments.some((g: Garment) => g.visible && g.category === 'dress');
  const garments = state.garments.map((g: Garment) => ({ ...g, visible: g.visible && (hasDress ? g.category === 'dress' : ['top', 'bottom'].includes(g.category)) }));
  expect((await page.request.patch('/api/session', { data: { ...state, garments } })).ok()).toBe(true);
  await ready(page);
  if ((page.viewportSize()?.width || 1000) < 650) await page.getByRole('button', { name: '3 Fitting room', exact: true }).click();
  await page.locator('.render-button').click();
  await expect(page.getByRole('button', { name: 'Save look', exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', /^\/api\/assets\//);
}
test.beforeEach(async ({ page, request }) => {
  expect(control, 'Fixture control URL is required; real credentials must never be used').toBeTruthy();
  expect((await request.post(`${control}/reset`, { data: {} })).ok()).toBe(true);
  const response = await request.get(`${control}/image`); expect(response.ok()).toBe(true);
  const fixtureImage = await response.body();
  await page.route('https://dti2irl-fixtures.example.com/**', route => route.fulfill({ status: 200, contentType: 'image/webp', body: fixtureImage }));
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
test('rendering waits for the last automatically selected product before capturing the outfit', async ({ page }) => {
  const blocked = gate(), entered = gate();
  await page.route('**/api/search', async route => {
    if (route.request().postDataJSON().garment.category !== 'shoes') { await route.continue(); return; }
    const response = await route.fetch(); entered.release(); await blocked.promise; await route.fulfill({ response });
  });
  try {
    await ready(page); await page.getByLabel('Outfit screenshot file').setInputFiles('public/demo/sample.webp');
    await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click(); await entered.promise;
    await expect(page.locator('.tray-item')).toHaveCount(2);
    await expect(page.locator('.render-button')).toBeDisabled(); await expect(page.locator('.retry-piece')).toBeDisabled();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: '3 Fitting room', exact: true }).click();
    await expect(page.locator('.mobile-next button')).toBeDisabled();
    blocked.release(); await expect(page.locator('.tray-item')).toHaveCount(3); await generate(page);
    await expect(page.locator('.stale-note')).toHaveCount(0);
  } finally { blocked.release(); }
});
test('finishing background analysis cannot clear a pending person upload indicator', async ({ page }) => {
  const shopping = gate(), searched = gate(), upload = gate(), uploading = gate();
  await page.route('**/api/search', async route => {
    if (route.request().postDataJSON().garment.category !== 'shoes') { await route.continue(); return; }
    const response = await route.fetch(); searched.release(); await shopping.promise; await route.fulfill({ response });
  });
  try {
    await ready(page); await page.getByLabel('Outfit screenshot file').setInputFiles('public/demo/sample.webp');
    await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click(); await searched.promise;
    // Keep the browser's multipart stream intact; route.fetch() can omit file bytes.
    await page.route('**/api/upload', async route => { uploading.release(); await upload.promise; await route.continue(); });
    await page.getByRole('button', { name: 'Your photo', exact: true }).click(); await page.locator('.photo-consent input[type=checkbox]').check();
    await page.getByLabel('Person photo file').setInputFiles('public/demo/base-peace.webp'); await uploading.promise;
    shopping.release(); await expect(page.locator('.tray-item')).toHaveCount(3);
    await expect(page.locator('.rendering-overlay')).toContainText('Preparing your photo');
    await expect(page.locator('.render-button')).toBeDisabled();
    upload.release(); await expect(page.getByText('Your photo is selected')).toBeVisible(); await expect(page.locator('.rendering-overlay')).toHaveCount(0);
  } finally { shopping.release(); upload.release(); }
});
test('uploaded screenshot invokes vision, real shopping adapters and contextual visual ranking', async ({ page, request }) => {
  await analyze(page); await expect(page.getByText('Ranked with an AI image comparison', { exact: false })).toBeVisible();
  await expect(page.getByText('Demo listing', { exact: true })).toHaveCount(0);
  await expect(page.getByText('UNSAFE MUST BE DROPPED', { exact: true })).toHaveCount(0);
  const records = await calls(request);
  expect(records.some(c => c.provider === 'vision' && c.schema === 'outfit')).toBe(true);
  expect(records.some(c => c.provider === 'vision' && c.schema === 'matches')).toBe(true);
  expect(records.some(c => c.provider === 'shopping' && c.market === 'us')).toBe(true);
  expect(records.some(c => c.provider === 'ebay' && c.market === 'EBAY_US')).toBe(true);
  const links = await page.locator('.product-card a').evaluateAll(els => els.map(el => (el as HTMLAnchorElement).href));
  expect(links.every(href => href.startsWith('https://example.com/fixture/'))).toBe(true);
  expect((await page.request.get('/api/session')).headers()['cache-control']).toContain('no-store');
});
test('hosted try-on composes bottom then top, stores private output, and reposes with three references', async ({ page, request }) => {
  await analyze(page); await generate(page);
  const records = await calls(request), submitted = records.filter(c => c.provider === 'tryon-submit');
  expect(submitted.map(c => c.category)).toEqual(['bottoms', 'tops']); expect(submitted.every(c => c.model === 'tryon-v1.6')).toBe(true);
  expect(submitted[0].personHash).not.toBe(submitted[1].personHash);
  const original = await page.getByTestId('wardrobe-image').getAttribute('src');
  await page.getByRole('button', { name: 'Peace sign', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Peace sign', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
  await expect(page.getByTestId('wardrobe-image')).not.toHaveAttribute('src', original!);
  expect((await calls(request)).filter(c => c.provider === 'pose-submit')).toMatchObject([{ imageCount: 3 }]);
  expect((await calls(request)).filter(c => c.provider === 'tryon-submit')).toHaveLength(2);
});
test('personal-photo try-on truthfully labels the original pose before an explicit pose edit', async ({ page, request }) => {
  await analyze(page); await page.getByRole('button', { name: 'Your photo', exact: true }).click(); await page.locator('.photo-consent input[type=checkbox]').check();
  await page.getByLabel('Person photo file').setInputFiles('public/demo/base-peace.webp'); await expect(page.getByText('Your photo is selected')).toBeVisible();
  await generate(page); await expect(page.getByText('Your original photo pose', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neutral runway', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect((await calls(request)).filter(c => c.provider === 'pose-submit')).toHaveLength(0);
});
test('failed hosted generation preserves the previous result and retry is an actual new request', async ({ page, request }) => {
  await analyze(page); await generate(page); const prior = await page.getByTestId('wardrobe-image').getAttribute('src');
  await configure(request, { tryon: 'failed' }); await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'FASHN could not render' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', prior!); await expect(page.getByRole('button', { name: 'Save look', exact: true })).toBeEnabled();
  await configure(request, { tryon: 'valid' }); await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(page.getByTestId('wardrobe-image')).not.toHaveAttribute('src', prior!, { timeout: 20000 });
  expect((await calls(request)).filter(c => c.provider === 'tryon-submit')).toHaveLength(5);
});
test('missing and corrupt model outputs never become successful renders', async ({ page, request }) => {
  await analyze(page); await page.getByRole('button', { name: 'Hide Test boots', exact: true }).click(); await configure(request, { tryon: 'empty' }); await page.locator('.render-button').click();
  await expect(page.getByRole('alert').filter({ hasText: 'without an image' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Save look', exact: true })).toBeDisabled();
  await configure(request, { tryon: 'corrupt' }); await page.locator('.render-button').click();
  await expect(page.getByRole('alert').filter({ hasText: 'decoded' })).toBeVisible({ timeout: 15000 });
  const response = await page.request.get('/api/session'); expect(response.ok()).toBe(true);
  expect((await response.json()).renders).toHaveLength(0);
});
test('pose failures and unsafe queue URLs retain the last try-on', async ({ page, request }) => {
  await analyze(page); await generate(page); const prior = await page.getByTestId('wardrobe-image').getAttribute('src');
  for (const [mode, message] of [['failed', 'Pose editing failed'], ['unsafe', 'invalid queue URL']]) {
    await configure(request, { pose: mode }); await page.getByRole('button', { name: 'Peace sign', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible({ timeout: 15000 }); await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', prior!);
  }
});
test('malformed vision output stays editable and recovers after the provider is repaired', async ({ page, request }) => {
  await configure(request, { vision: 'malformed' }); await ready(page); await page.getByLabel('Outfit screenshot file').setInputFiles('public/demo/sample.webp');
  await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: 'invalid garment description' })).toBeVisible(); await expect(page.getByText('Build the breakdown')).toBeVisible();
  await configure(request, { vision: 'valid' }); await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
  await expect(page.getByText('3 pieces in this look')).toBeVisible(); await expect(page.locator('.render-button')).toBeEnabled();
});
test('one shopping provider can fail without substituting demo listings', async ({ page, request }) => {
  await configure(request, { shopping: 'failure' }); await analyze(page);
  await expect(page.getByRole('status')).toContainText('503'); await expect(page.locator('.product-source').first()).toContainText('eBay');
  await expect(page.getByText('Demo listing', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle product filters' }).click(); await page.getByRole('checkbox', { name: 'Secondhand only' }).check();
  await page.getByRole('button', { name: 'Search with filters', exact: true }).click();
  await expect.poll(async () => (await calls(request)).some(c => c.provider === 'ebay' && c.filter === 'conditions:{USED}')).toBe(true);
  await expect(page.getByRole('button', { name: 'Search again for Test knit', exact: true })).toBeEnabled();
});
test('both shopping providers failing gives a recoverable error, not fake matches', async ({ page, request }) => {
  await configure(request, { shopping: 'failure', ebay: 'failure' }); await ready(page); await page.getByLabel('Outfit screenshot file').setInputFiles('public/demo/sample.webp');
  await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: '503' })).toBeVisible(); await expect(page.locator('.product-card')).toHaveCount(0);
  await configure(request, { shopping: 'valid', ebay: 'valid' }); await page.getByRole('button', { name: 'Search again for Test knit', exact: true }).click();
  await expect(page.locator('.product-card').first()).toBeVisible();
});
test('correcting a piece into a dress updates shopping and uses one-piece inference without reanalysis', async ({ page, request }) => {
  await analyze(page);
  await saved(page, state => Object.keys((state.selected || {}) as object).length === 3);
  const before = await (await page.request.get('/api/session')).json();
  await page.getByRole('button', { name: 'Edit Test knit', exact: true }).click();
  await page.getByLabel('Piece name').fill('Test evening dress');
  await page.getByRole('combobox', { name: 'Garment category', exact: true }).selectOption('dress');
  await page.getByLabel('Search keywords').fill('black satin maxi dress');
  await page.getByRole('button', { name: 'Save & search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test evening dress', exact: true })).toBeVisible();
  await expect(page.locator('.product-card').first()).toBeVisible(); await page.locator('.product-image').first().click();
  await generate(page);
  const records = await calls(request);
  expect(records.filter(c => c.provider === 'vision' && c.schema === 'outfit')).toHaveLength(1);
  expect(records.some(c => c.provider === 'shopping' && c.query === 'black satin maxi dress')).toBe(true);
  expect(records.filter(c => c.provider === 'tryon-submit').map(c => c.category)).toEqual(['one-pieces']);
  const after = await (await page.request.get('/api/session')).json();
  const corrected = after.state.garments.find((g: { category: string }) => g.category === 'dress');
  expect(corrected.id).toBe(before.state.garments.find((g: { category: string }) => g.category === 'top').id);
  expect(after.renders).toHaveLength(1);
});

test('pixel masks persist privately, show on the canvas, and can be refined without another vision call', async ({page,request})=>{
  await configure(request,{segmentation:'success'});await analyze(page);
  await expect(page.getByRole('img',{name:'Test knit pixel mask'})).toBeVisible();
  await saved(page,s=>!!(s.garments as Garment[] | undefined)?.[0]?.segmentation);
  const data=await(await page.request.get('/api/session')).json();
  const segment=data.state.garments[0].segmentation;
  const privateAsset=await page.request.get(`/api/assets/${segment.imageId}`);expect(privateAsset.status()).toBe(200);
  expect((await request.get(`/api/assets/${segment.imageId}`)).status()).toBe(401);
  await page.reload();await expect(page.getByRole('img',{name:'Test knit pixel mask'})).toBeVisible();
  await page.getByRole('button',{name:'Edit Test knit',exact:true}).click();
  await page.getByRole('button',{name:'Refine garment mask',exact:true}).click();
  await expect(page.locator('.notice')).toContainText('1 of 1 pieces have SAM pixel masks');
  expect((await calls(request)).filter(c=>c.provider==='vision'&&c.schema==='outfit')).toHaveLength(1);
  expect((await calls(request)).filter(c=>c.provider==='segmentation')).toHaveLength(2);
});

test('redrawing a detected region removes its stale mask until explicitly refined',async({page,request})=>{
  await configure(request,{segmentation:'success'});await analyze(page);
  await page.getByRole('button',{name:'Edit Test knit',exact:true}).click();
  await page.getByRole('button',{name:'Redraw region',exact:true}).click();
  await page.getByRole('spinbutton',{name:'X %',exact:true}).fill('10');
  await page.getByRole('button',{name:'Apply region',exact:true}).click();
  await expect(page.getByRole('img',{name:'Test knit pixel mask'})).toHaveCount(0);
  await saved(page,s=>{const g=(s.garments as Garment[] | undefined)?.[0];return !!g&&!g.segmentation&&g.bbox?.x===.1;});
});

test('mask service failure preserves recognized garments with an explicit limitation',async({page,request})=>{
  await configure(request,{segmentation:'failure'});await analyze(page);
  await expect(page.locator('.notice')).toContainText('Pixel masks unavailable');
  await expect(page.getByRole('button',{name:'Select Test knit region',exact:true})).toBeVisible();
  await expect(page.locator('.segmentation-overlay')).toHaveCount(0);
});
