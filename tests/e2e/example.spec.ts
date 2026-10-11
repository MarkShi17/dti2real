import { test, expect, ready, section, saved } from './helpers';
import { EXAMPLE_GARMENTS } from '../../src/lib/examples';

test('fitEXAMPLE reveals gradually even with warm caches, poses, compares, exports, and restores', async ({ page }, info) => {
  test.setTimeout(120000);
  await ready(page);
  const started = Date.now();
  await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  await expect(page.locator('[aria-label="Outfit progress"]')).toHaveAttribute('data-phase', 'analyzing');
  await expect(page.getByTestId('wardrobe-image')).toHaveCount(0);
  await expect(page.getByAltText('Original outfit inspiration')).toHaveAttribute('src', '/demo/fitexample-v1/source.webp');
  const image = page.getByTestId('wardrobe-image');
  await expect(image).toHaveAttribute('src', '/demo/fitexample-v1/runway.webp', { timeout: 30000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(14500);
  await expect(image).toHaveCSS('object-fit', 'contain');
  const captionClearance = await image.evaluate(img => document.querySelector('.stage-caption')!.getBoundingClientRect().top - img.getBoundingClientRect().bottom);
  expect(captionClearance).toBeGreaterThanOrEqual(0);
  await section(page, info, 1);
  await expect(page.locator('.retry-piece')).toHaveCount(0);
  await page.getByRole('tab', { name: 'bag', exact: true }).click();
  await expect(page.locator('.accessory-note')).toContainText('included');
  await section(page, info, 2);
  await expect(page.getByRole('button', { name: '3D avatar', exact: true })).toBeVisible();
  const paths = new Set([await image.getAttribute('src')]);
  for (const pose of ['Hand on hip', 'Peace sign', 'Over-the-shoulder', 'Dramatic lean']) {
    const poseStart = Date.now(); await page.getByRole('button', { name: pose, exact: true }).click();
    await expect(page.getByRole('button', { name: pose, exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(Date.now() - poseStart).toBeGreaterThanOrEqual(2300); paths.add(await image.getAttribute('src'));
  }
  expect(paths.size).toBe(5);
  await page.getByRole('button', { name: 'Before / after', exact: true }).click();
  await expect(page.getByAltText('Person before try-on')).toHaveAttribute('src', '/demo/fitexample-v1/before-lean.webp');
  await page.getByRole('button', { name: 'Save look', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Card with links (SVG)' }).click();
  expect((await download).suggestedFilename()).toContain('.svg');
  await saved(page, state => state.screenshotId === 'sample-fitexample-v1' && !!state.renderId);
  await page.reload(); await section(page, info, 2); await expect(image).toHaveAttribute('src', '/demo/fitexample-v1/lean.webp');
  const replay = Date.now(); await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  await expect(image).toHaveCount(0);
  await expect(image).toHaveAttribute('src', '/demo/fitexample-v1/runway.webp', { timeout: 30000 });
  expect(Date.now() - replay).toBeGreaterThanOrEqual(14500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('example mesh is a real posed model with orbit, proportions and snapshot controls', async ({ page }, info) => {
  test.setTimeout(90000); await ready(page);
  await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/fitexample-v1/runway.webp', { timeout: 30000 });
  await section(page, info, 2); await page.getByRole('button', { name: '3D avatar', exact: true }).click();
  const stage = page.getByTestId('avatar-stage');
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  const canvas = stage.locator('canvas');
  await expect(canvas).toHaveAttribute('data-example-fixture', 'fitexample-v1');
  const pixels = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const front = await pixels(); await stage.getByRole('button', { name: 'Back', exact: true }).click();
  await expect.poll(pixels).not.toBe(front);
  await stage.getByRole('button', { name: 'Reset 3D view' }).click();
  await page.getByRole('button', { name: 'Peace sign', exact: true }).click();
  await expect(stage).toHaveAttribute('data-pose', 'peace'); await expect.poll(pixels).not.toBe(front);
  await stage.getByRole('button', { name: 'Adjust body proportions' }).click();
  await stage.getByRole('slider', { name: 'Shoulders proportion' }).fill('1.1');
  const download = page.waitForEvent('download'); await stage.getByRole('button', { name: 'Download 3D snapshot' }).click();
  expect((await download).suggestedFilename()).toBe('dti2irl-avatar-peace.png');
  await stage.screenshot({ path: `.cache/fitexample-v1/avatar-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Photo preview', exact: true }).click();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/fitexample-v1/peace.webp');
});

test('removing a required example piece keeps its old photo stale instead of faking a new outfit', async ({ page }, info) => {
  test.setTimeout(60000); await ready(page);
  await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/fitexample-v1/runway.webp', { timeout: 30000 });
  await section(page, info, 1);
  await page.getByRole('button', { name: 'Remove Burgundy leather crossbody bag', exact: true }).click();
  await section(page, info, 2);
  await expect(page.getByText('Your outfit changed. Render to update this preview.')).toBeVisible();
  await expect(page.locator('.render-button')).toBeDisabled();
  await expect(page.locator('.missing-selections')).toContainText(EXAMPLE_GARMENTS.find(g => g.category === 'bag')!.name);
});
