import { test, expect } from '@playwright/test';
import { DEMO_GARMENTS, demoProducts } from '../../src/lib/fixtures';

test('strict rejection clears the selected piece, updates progress, and allows try-on after recovery', async ({ page }, info) => {
  const top = DEMO_GARMENTS.find(g => g.category === 'top')!;
  const product = demoProducts(top)[0];
  let rejectTop = false;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Exercise real demo APIs, controlling only the photo-verification outcome.
  await page.route('**/api/search', async route => {
    const input = route.request().postDataJSON();
    expect(input.imageId).toBe('sample');
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const result = await response.json();
    await route.fulfill({ response, json: {
      ...result,
      strictMatching: true,
      products: rejectTop && input.garment.id === top.id ? [] : result.products.map((p: object) => ({ ...p, visualVerified: true, matchReason: 'Visual match: Color and silhouette match the reference.' })),
    } });
  });
  const panel = async (step: number) => {
    if (info.project.name === 'mobile') await page.getByRole('button', { name: ['1 Inspiration', '2 Find pieces', '3 Fitting room'][step], exact: true }).click();
  };
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  const progress = page.getByRole('region', { name: 'Outfit progress' });
  await expect(progress).toContainText('5 matched');
  await panel(1);
  await expect(page.getByRole('button', { name: `Remove ${product.title}`, exact: true })).toBeVisible();
  await expect(page.getByText('Color and silhouette match the reference.').first()).toBeVisible();

  rejectTop = true;
  await page.getByRole('button', { name: `Search again for ${top.name}`, exact: true }).click();
  await expect(progress).toContainText('4 matched');
  await expect(progress).toContainText('1 without matches');
  await expect(page.getByText('No close match found', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Remove ${product.title}`, exact: true })).toHaveCount(0);
  await panel(2);
  await expect(page.locator('.render-button')).toBeDisabled();

  rejectTop = false;
  await panel(1);
  await page.getByRole('button', { name: `Search again for ${top.name}`, exact: true }).click();
  await expect(progress).toContainText('5 matched');
  await page.getByRole('button', { name: `Select ${product.title}`, exact: true }).click();
  await panel(2);
  await page.locator('.render-button').click();
  await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeEnabled();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/silver-runway.webp');
  expect(errors).toEqual([]);
});
