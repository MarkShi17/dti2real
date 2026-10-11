import { test, expect, ready, section, seed, saved } from './helpers';

test('a saved 3D view restores to photos without loading avatar assets', async ({ page }, info) => {
  const avatarRequests: string[] = [];
  page.on('request', request => { if (/\/avatar\//.test(new URL(request.url()).pathname)) avatarRequests.push(request.url()); });
  const state = await seed(page.request);
  expect((await page.request.patch('/api/session', { data: { ...state, view: '3d' } })).ok()).toBe(true);
  await ready(page); await section(page, info, 2);
  await expect(page.getByRole('button', { name: '3D avatar', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('avatar-stage')).toHaveCount(0);
  await expect(page.getByTestId('wardrobe-placeholder')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeDisabled();
  await saved(page, state => state.view === 'photo');
  await page.locator('.render-button').click();
  await expect(page.getByTestId('wardrobe-image')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Hand on hip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(avatarRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
