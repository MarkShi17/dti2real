import { test, expect, ready, section, seeded } from './helpers';

test('3D selected garment photos load through private endpoints and survive a controls update', async ({ page }, info) => {
  test.setTimeout(90000);
  await seeded(page);
  const references: string[] = [];
  page.on('request', request => {
    if (/\/api\/products\/[^/]+\/image$/.test(new URL(request.url()).pathname)) references.push(request.url());
  });
  await section(page, info, 2);
  await page.getByRole('button', { name: '3D avatar', exact: true }).click();
  const stage = page.getByTestId('avatar-stage');
  await expect.poll(async () => await stage.getAttribute('data-ready') === 'true' || await stage.getByRole('alert').isVisible(), { timeout: 30000 }).toBe(true);
  if (await stage.getAttribute('data-ready') !== 'true') {
    await expect(stage.getByRole('alert')).toContainText('Enable WebGL');
    return;
  }
  const canvas = stage.locator('canvas');
  await expect(canvas).toHaveAttribute('data-texture-ready', 'true', { timeout: 60000 });
  await expect.poll(async () => Number(await canvas.getAttribute('data-garment-textures'))).toBeGreaterThanOrEqual(2);
  expect(references.length).toBeGreaterThanOrEqual(2);
  expect(references.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  const requestCount = references.length;
  const originalCanvas = await canvas.elementHandle();
  await stage.getByRole('button', { name: 'Adjust body proportions' }).click();
  await expect(stage.getByRole('slider', { name: 'Shoulders proportion' })).toBeVisible();
  expect(await canvas.evaluate((element, original) => element === original, originalCanvas)).toBe(true);
  expect(references).toHaveLength(requestCount);
});

test('3D manual white tank stays sleeveless and exposes no photo-generation action', async ({ page }, info) => {
  expect((await page.request.post('/api/session')).ok()).toBe(true);
  const garment = { id: 'manual-white-tank', name: 'White sleeveless tank top', category: 'top', attributes: { color: ['white'], material: 'cotton', silhouette: 'fitted', details: ['sleeveless'] }, visible: true, confidence: 1, searchQueries: [] };
  expect((await page.request.patch('/api/session', { data: { screenshotId: 'sample', personId: 'studio', garments: [garment], selected: {}, activeId: garment.id, renderId: null } })).ok()).toBe(true);
  await ready(page);
  await section(page, info, 2);
  await page.getByRole('button', { name: '3D avatar', exact: true }).click();
  const stage = page.getByTestId('avatar-stage');
  await expect.poll(async () => await stage.getAttribute('data-ready') === 'true' || await stage.getByRole('alert').isVisible(), { timeout: 30000 }).toBe(true);
  if (await stage.getAttribute('data-ready') === 'true') {
    const meshes = (await stage.locator('canvas').getAttribute('data-garment-meshes'))!.split(',');
    expect(meshes).toContain('tank');
    expect(meshes).not.toContain('knit');
    expect(meshes).not.toContain('blouse');
  } else await expect(stage.getByRole('alert')).toContainText('Enable WebGL');
  await expect(page.getByRole('button', { name: /Try on this fit|Regenerate photo/i })).toHaveCount(0);
});
