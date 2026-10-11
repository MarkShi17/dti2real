import { type Page } from '@playwright/test';
import { test, expect, saved, seed, ready, DEMO_GARMENTS } from './helpers';
import path from 'node:path';
async function enterLegacySample(page: Page, mobile: boolean) {
  // Legacy variant coverage stays separate from the curated fitEXAMPLE journey.
  await seed(page.request, DEMO_GARMENTS, DEMO_GARMENTS.map(g => g.category));
  await ready(page);
  if (mobile) await page.getByRole('button', { name: '1 Inspiration', exact: true }).click();
  await expect(page.getByText('5 pieces in this look')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Midnight knit' })).toBeVisible();
}
async function fittingRoom(page: Page, mobile: boolean) { if (mobile) await page.getByRole('button', { name: '3 Fitting room', exact: true }).click(); }
test('sample outfit, individual skirt swap, five distinct poses, save and persistence', async ({ page }, info) => {
  const mobile = info.project.name.includes('mobile');
  await enterLegacySample(page, mobile);
  await fittingRoom(page, mobile);
  await expect(page.getByTestId('wardrobe-image')).toHaveCount(0);
  await expect(page.getByTestId('wardrobe-placeholder')).toBeVisible();
  await page.locator('.render-button').click();
  const image = page.getByTestId('wardrobe-image');
  await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeEnabled();
  const paths = new Set([await image.getAttribute('src')]);
  for (const pose of ['Hand on hip', 'Peace sign', 'Over-the-shoulder', 'Dramatic lean']) {
    await page.getByRole('button', { name: pose, exact: true }).click(); await expect(page.getByRole('button', { name: pose, exact: true })).toHaveAttribute('aria-pressed', 'true'); paths.add(await image.getAttribute('src'));
  }
  expect(paths.size).toBe(5);
  if (mobile) await page.getByRole('button', { name: '2 Find pieces', exact: true }).click();
  await page.getByRole('tab', { name: 'bottom', exact: true }).click();
  await page.getByRole('button', { name: 'Select Burgundy pleated maxi skirt', exact: true }).click();
  await fittingRoom(page, mobile); await expect(page.getByText('Your outfit changed. Render to update this preview.')).toBeVisible();
  await page.locator('.render-button').click(); await expect(image).toHaveAttribute('src', '/demo/burgundy-runway.webp');
  await page.getByRole('button', { name: 'Save look', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Card with links (SVG)', exact: true }).click(); expect((await download).suggestedFilename()).toContain('.svg');
  await saved(page, state => !!state.renderId && (state.selected as Record<string, string>)['demo-bottom'] === 'fixture-demo-bottom-1'); await page.reload(); await fittingRoom(page, mobile); await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/burgundy-runway.webp');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('studio', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});
test('manual corrections, price filters, own-photo consent, honest demo limits and deletion', async ({ page }, info) => {
  const mobile = info.project.name.includes('mobile'); await enterLegacySample(page, mobile);
  await page.getByRole('button', { name: 'Edit City ankle boots', exact: true }).click(); await page.getByLabel('Piece name').fill('Platform ankle boots');
  await page.getByRole('button', { name: 'Save & search', exact: true }).click(); await expect(page.getByRole('button', { name: 'Edit Platform ankle boots' })).toBeVisible();
  if (mobile) await page.getByRole('button', { name: '2 Find pieces', exact: true }).click();
  await page.getByRole('tab', { name: 'top', exact: true }).click(); await page.getByRole('button', { name: 'Toggle product filters' }).click();
  await page.getByRole('spinbutton', { name: 'Maximum price in USD' }).fill('10'); await expect(page.getByText('No close match found')).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click(); await expect(page.getByRole('button', { name: 'Select Black ribbed high-neck knit' })).toBeVisible();
  await fittingRoom(page, mobile); await page.getByRole('button', { name: 'Your photo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose person photo', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').last().check();
  await page.getByLabel('Person photo file').setInputFiles(path.resolve('public/demo/base-runway.webp'));
  await expect(page.getByText('Your photo is selected')).toBeVisible(); await expect(page.locator('.render-button')).toBeDisabled();
  await expect(page.getByTestId('wardrobe-image')).toHaveCount(0);
  await expect(page.getByTestId('wardrobe-placeholder')).toBeVisible();
  await expect(page.getByAltText('Your selected person reference')).toHaveAttribute('src', /^\/api\/assets\//);
  await expect(page.getByText('Your 3D avatar remains available.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Delete my session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep my session' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Delete session', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Keep my session' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Delete my session', exact: true }).click(); await page.getByRole('button', { name: 'Delete session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Upload a screenshot', exact: true })).toBeEnabled();
});
test('uploaded screenshot, manual garment and keyboard region correction', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Explore an example', exact: true })).toBeEnabled();
  await page.getByLabel('Outfit screenshot file').setInputFiles(path.resolve('public/demo/sample.webp'));
  await expect(page.getByAltText('Original outfit inspiration')).toBeVisible();
  await expect(page.getByTestId('wardrobe-image')).toHaveCount(0);
  await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
  await expect(page.getByRole('status')).toContainText('manual');
  if (info.project.name.includes('mobile')) await page.getByRole('button', { name: '1 Inspiration', exact: true }).click();
  await page.getByRole('button', { name: 'Add piece', exact: true }).click();
  await page.getByLabel('Piece name').fill('Ruby dress');
  await page.getByRole('combobox', { name: 'Garment category', exact: true }).selectOption('dress');
  await page.getByRole('button', { name: 'Redraw region', exact: true }).click();
  await page.getByLabel('X %', { exact: true }).fill('20');
  await page.getByLabel('Y %', { exact: true }).fill('25');
  await page.getByLabel('W %', { exact: true }).fill('55');
  await page.getByLabel('H %', { exact: true }).fill('65');
  await page.getByRole('button', { name: 'Apply region', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select Ruby dress region', exact: true })).toHaveCSS('left', /.+px/);
  await page.getByRole('button', { name: 'Rotate screenshot clockwise', exact: true }).click();
  await expect(page.getByText('Build the breakdown')).toBeVisible();
  const image = page.getByAltText('Original outfit inspiration');
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth > el.naturalHeight)).toBe(true);
});
