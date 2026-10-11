import { readFile } from 'node:fs/promises';
import { test, expect, seeded, section, render, ready, saved } from './helpers';

test('empty studio gates generation, identifies demo providers, and exposes help', async ({ page }, info) => {
  await ready(page); await page.getByRole('button', { name: 'Demo mode +' }).click();
  await expect(page.getByText('Provider status', { exact: true })).toBeVisible();
  await expect(page.getByText('Configured means credentials are present', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Close provider status' }).click();
  await page.getByRole('button', { name: 'How it works' }).click(); await expect(page.getByText('From game fit to real-world outfit.')).toBeVisible();
  await page.getByRole('button', { name: 'Got it', exact: false }).click();
  await section(page, info, 2); await expect(page.locator('.render-button')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save look', exact: true })).toBeDisabled();
  for (const pose of ['Neutral runway', 'Hand on hip', 'Peace sign', 'Over-the-shoulder', 'Dramatic lean']) await expect(page.getByRole('button', { name: pose, exact: true })).toBeDisabled();
});
for (const file of [
  { title: 'unsupported SVG', name: 'outfit.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>'), message: /PNG, JPEG or WebP/ },
  { title: 'oversized upload', name: 'large.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(8 * 1024 * 1024 + 1), message: /under 8 MB/ },
  { title: 'corrupt PNG', name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png'), message: /decoded/ },
]) test(`rejects ${file.title} and allows a valid upload afterwards`, async ({ page }) => {
  await ready(page); await page.getByLabel('Outfit screenshot file').setInputFiles(file);
  await expect(page.getByRole('alert').filter({ hasText: file.message })).toBeVisible();
  await page.getByLabel('Outfit screenshot file').setInputFiles('public/demo/sample.webp');
  await expect(page.getByAltText('Original outfit inspiration')).toBeVisible(); await expect(page.getByText('Screenshot uploaded.', { exact: false })).toBeVisible();
});
test('drag-and-drop upload displays a preview and manual analysis is honest', async ({ page }, info) => {
  await ready(page); const bytes = [...await readFile('public/demo/sample.webp')];
  await page.locator('.upload-zone').evaluate((el, bytes) => { const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], 'outfit.webp', { type: 'image/webp' })); el.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer })); }, bytes);
  await expect(page.getByAltText('Original outfit inspiration')).toBeVisible();
  await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
  await expect(page.getByRole('status')).toContainText('manual'); await section(page, info, 0);
  await expect(page.getByText('Build the breakdown')).toBeVisible(); await expect(page.locator('.region')).toHaveCount(0);
});
test('crop changes source dimensions and clears previous garment selections', async ({ page }) => {
  await seeded(page); await page.getByRole('button', { name: 'Crop screenshot', exact: true }).click();
  const canvas = page.locator('.image-canvas'), bounds = await canvas.boundingBox(); expect(bounds).not.toBeNull();
  await canvas.scrollIntoViewIfNeeded(); const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * .2, b.y + b.height * .2); await page.mouse.down(); await page.mouse.move(b.x + b.width * .8, b.y + b.height * .8, { steps: 8 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click();
  await expect(page.getByText('Build the breakdown')).toBeVisible(); await expect(page.locator('.region')).toHaveCount(0);
  await expect.poll(() => page.getByAltText('Original outfit inspiration').evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeLessThan(900);
});
test('hiding and restoring a garment updates regions and selected inventory', async ({ page }, info) => {
  await seeded(page); await page.getByRole('button', { name: 'Hide Midnight knit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select Midnight knit region' })).toHaveCount(0);
  await expect(page.getByText('4 pieces in this look')).toBeVisible();
  await section(page, info, 1); await expect(page.getByRole('button', { name: 'Replace Black ribbed high-neck knit' })).toHaveCount(0);
  await section(page, info, 0); await page.getByRole('button', { name: 'Show Midnight knit', exact: true }).click();
  await expect(page.getByText('5 pieces in this look')).toBeVisible(); await section(page, info, 2); await expect(page.locator('.render-button')).toBeDisabled();
});
test('removing a required product disables rendering until it is selected again', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1); await page.getByRole('button', { name: 'Remove Silver satin pleated maxi skirt', exact: true }).click();
  await section(page, info, 2); await expect(page.locator('.render-button')).toBeDisabled();
  await section(page, info, 1); await page.getByRole('tab', { name: 'bottom', exact: true }).click(); await page.getByRole('button', { name: 'Select Silver satin pleated maxi skirt', exact: true }).click();
  await section(page, info, 2); await expect(page.locator('.render-button')).toBeEnabled();
});
test('filters combine source, secondhand and price without losing selected inventory', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1); await page.getByRole('button', { name: 'Toggle product filters' }).click();
  await page.getByRole('combobox', { name: 'Marketplace filter' }).selectOption('Vintage sample');
  await page.getByRole('checkbox', { name: 'Secondhand only' }).check(); await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.getByText('Price unavailable', { exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Maximum price in USD' }).fill('100'); await expect(page.getByText('No close match found')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace Black ribbed high-neck knit' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click(); await expect(page.locator('.product-card')).toHaveCount(3);
});
test('all marketplace links are HTTPS, isolated new tabs, and clearly labeled searches in demo', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1);
  const links = await page.locator('.product-card a, .depop-search').evaluateAll(els => els.map(el => ({ href: (el as HTMLAnchorElement).href, target: el.getAttribute('target'), rel: el.getAttribute('rel') })));
  expect(links.length).toBeGreaterThanOrEqual(4);
  for (const link of links) { expect(link.href).toMatch(/^https:\/\//); expect(link.target).toBe('_blank'); expect(link.rel).toContain('noopener'); }
  await expect(page.getByText('Demo listings & illustrative prices · search links only')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View item', exact: false })).toHaveCount(0);
});
test('unsupported demo product keeps the previous image visibly stale and reports the limit', async ({ page }, info) => {
  await seeded(page); await render(page, info); const previous = await page.getByTestId('wardrobe-image').getAttribute('src');
  await section(page, info, 1); await page.getByRole('button', { name: 'Select Black fitted mock-neck sweater', exact: true }).click();
  await section(page, info, 2); await page.locator('.render-button').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Other selections need live try-on' })).toBeVisible();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', previous!); await expect(page.getByRole('button', { name: 'Save look', exact: true })).toBeDisabled();
  await expect(page.getByText('Your outfit changed.', { exact: false })).toBeVisible();
});
test('comparison slider and history preserve the chosen pose without rerunning shopping', async ({ page }, info) => {
  await seeded(page); let searches = 0; page.on('request', req => { if (req.url().endsWith('/api/search')) searches++; });
  await render(page, info); await page.getByRole('button', { name: 'Peace sign', exact: true }).click();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/silver-peace.webp');
  await page.getByRole('button', { name: 'Before / after', exact: true }).click(); const slider = page.getByRole('slider', { name: 'Before and after comparison' }); await slider.fill('25');
  await expect(page.locator('.comparison-image')).toHaveCSS('clip-path', 'inset(0px 75% 0px 0px)');
  await page.getByRole('button', { name: 'Before / after', exact: true }).click(); await expect(slider).toHaveCount(0);
  await page.getByRole('button', { name: 'Show render history', exact: true }).click(); await page.locator('.render-history button').filter({ hasText: 'runway' }).click();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/silver-runway.webp'); expect(searches).toBe(0);
});
test('regeneration creates a new base and subsequent poses follow that generation', async ({ page }, info) => {
  await seeded(page); await render(page, info);
  const complete = page.waitForResponse(res => res.url().endsWith('/api/tryon') && res.request().postDataJSON().force === true);
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click(); const job = await (await complete).json();
  await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeEnabled();
  const state = await (await page.request.get('/api/session')).json(); const generated = state.renders.find((r: { id: string }) => r.id === state.renders.at(-1).id);
  const request = page.waitForRequest(req => req.url().endsWith('/api/pose'));
  await page.getByRole('button', { name: 'Hand on hip', exact: true }).click(); expect((await request).postDataJSON().renderId).toBe(generated.id);
  expect(job.id).toBeTruthy(); await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/silver-hip.webp');
});
test('per-piece retry sends the selected garment and returns a usable preview', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1);
  const request = page.waitForRequest(req => req.url().endsWith('/api/tryon'));
  await page.getByRole('button', { name: 'Retry Midnight knit in fitting room', exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ retryGarmentId: 'demo-top', force: false });
  await section(page, info, 2); await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeEnabled();
});
test('text resembling HTML stays text and never creates executable elements', async ({ page }, info) => {
  await seeded(page); await page.getByRole('button', { name: 'Edit Midnight knit' }).click();
  const name = '<img src=x onerror=alert(1)>'; await page.getByLabel('Piece name').fill(name); await page.getByRole('button', { name: 'Save & search', exact: true }).click();
  await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeVisible();
  await section(page, info, 1); await expect(page.getByRole('heading', { name, exact: true })).toBeVisible(); await expect(page.locator('img[onerror]')).toHaveCount(0);
});
test('reduced-motion and narrow layouts remain usable with no broken images or overflow', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await seeded(page); await render(page, info);
  if (!info.project.name.includes('mobile')) await page.setViewportSize({ width: 320, height: 850 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => page.locator('img:visible').evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.locator('.render-button')).toBeEnabled();
});
test('selected pieces survive filtered searches, autosave and reload', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1); await page.getByRole('button', { name: 'Toggle product filters' }).click();
  await page.getByRole('spinbutton', { name: 'Maximum price in USD' }).fill('1');
  await page.getByRole('button', { name: 'Search with filters', exact: true }).click(); await expect(page.getByText('No close match found')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace Black ribbed high-neck knit' })).toBeVisible();
  await saved(page, s => (s.selected as Record<string, string>)?.['demo-top'] === 'fixture-demo-top-0'); await page.reload(); await section(page, info, 1);
  await expect(page.getByRole('button', { name: 'Replace Black ribbed high-neck knit' })).toBeVisible();
});
