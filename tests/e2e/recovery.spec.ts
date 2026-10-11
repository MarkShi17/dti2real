import { test, expect, seeded, ready, section, render, gate, saved } from './helpers';

test('initial session failure is actionable and a reload recovers', async ({ page }) => {
  let fail = true;
  await page.route('**/api/session', async route => {
    if (route.request().method() === 'POST' && fail) { fail = false; await route.fulfill({ status: 503, json: { error: 'Test session service unavailable' } }); }
    else await route.continue();
  });
  await page.goto('/'); await expect(page.getByRole('alert').filter({ hasText: 'Test session service unavailable' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Explore an example', exact: true })).toBeEnabled();
});
test('search error preserves the last candidates and a retry clears the error', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1);
  await page.route('**/api/search', route => route.fulfill({ status: 502, json: { error: 'Test shopping provider unavailable' } }));
  await page.getByRole('button', { name: 'Search again for Midnight knit', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Test shopping provider unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select Black ribbed high-neck knit', exact: true })).toBeVisible();
  await page.unroute('**/api/search'); await page.getByRole('button', { name: 'Search again for Midnight knit', exact: true }).click();
  await expect(page.locator('.error-banner')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Search again for Midnight knit', exact: true })).toBeEnabled();
});
test('analysis failure releases the upload workflow and supports retry', async ({ page }) => {
  await ready(page); await page.getByLabel('Outfit screenshot file').setInputFiles('public/demo/sample.webp');
  await page.route('**/api/analyze', route => route.fulfill({ status: 502, json: { error: 'Test vision JSON invalid' } }));
  await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: 'Test vision JSON invalid' })).toBeVisible();
  await page.unroute('**/api/analyze'); await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
  await expect(page.getByRole('status')).toContainText('manual'); await expect(page.locator('.error-banner')).toHaveCount(0);
});
test('failed pose request retains the last usable pose and can be retried', async ({ page }, info) => {
  await seeded(page); await render(page, info);
  await page.route('**/api/pose', route => route.fulfill({ status: 502, json: { error: 'Test pose provider failed' } }));
  await page.getByRole('button', { name: 'Peace sign', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Test pose provider failed' })).toBeVisible();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/silver-runway.webp'); await expect(page.getByRole('button', { name: 'Save look', exact: true })).toBeEnabled();
  await page.unroute('**/api/pose'); await page.getByRole('button', { name: 'Peace sign', exact: true }).click();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/silver-peace.webp');
});
test('failed job polling releases busy controls and regeneration recovers', async ({ page }, info) => {
  await seeded(page); await section(page, info, 2);
  await page.route('**/api/jobs/*', route => route.fulfill({ status: 200, json: { id: 'test', status: 'failed', error: 'Test inference interrupted' } }));
  await page.locator('.render-button').click(); await expect(page.getByRole('alert').filter({ hasText: 'Test inference interrupted' })).toBeVisible();
  await expect(page.locator('.render-button')).toBeEnabled(); await page.unroute('**/api/jobs/*'); await page.locator('.render-button').click();
  await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeEnabled();
});
test('failed export preserves the rendered image and download can be retried', async ({ page }, info) => {
  await seeded(page); await render(page, info); await page.getByRole('button', { name: 'Save look', exact: true }).click();
  await page.route('**/api/export', route => route.fulfill({ status: 500, json: { error: 'Test export failure' } }));
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Test export failure' })).toBeVisible();
  await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src', '/demo/silver-runway.webp'); await page.unroute('**/api/export');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PNG', exact: true }).click(); expect((await download).suggestedFilename()).toBe('dti2irl-runway.png');
});
test('a pending search cannot resurrect a deleted session', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1); const blocked = gate(), entered = gate();
  await page.route('**/api/search', async route => { const response = await route.fetch(); entered.release(); await blocked.promise; await route.fulfill({ response }); });
  try {
    await page.getByRole('button', { name: 'Search again for Midnight knit', exact: true }).click(); await entered.promise;
    await page.getByRole('button', { name: 'Delete my session', exact: true }).click(); await page.getByRole('button', { name: 'Delete session', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Upload a screenshot', exact: true })).toBeEnabled(); blocked.release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.locator('.garment-row')).toHaveCount(0); await expect(page.locator('.tray-item')).toHaveCount(0);
    await page.reload(); await expect(page.getByRole('button', { name: 'Upload a screenshot', exact: true })).toBeEnabled();
  } finally { blocked.release(); }
});
test('editing a garment ignores an older delayed search response', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1); const blocked = gate(), entered = gate(); let first = true;
  await page.route('**/api/search', async route => {
    if (!first) { await route.continue(); return; } first = false;
    const response = await route.fetch(); const body = await response.json(); body.products = body.products.map((p: object) => ({ ...p, title: 'STALE RESULT MUST NOT APPEAR' }));
    entered.release(); await blocked.promise; await route.fulfill({ json: body });
  });
  try {
    await page.getByRole('button', { name: 'Search again for Midnight knit', exact: true }).click(); await entered.promise;
    await section(page, info, 0); await page.getByRole('button', { name: 'Edit Midnight knit', exact: true }).click(); await page.getByLabel('Piece name').fill('Corrected knit');
    await page.getByRole('button', { name: 'Save & search', exact: true }).click(); await section(page, info, 1);
    await expect(page.getByRole('button', { name: 'Search again for Corrected knit', exact: true })).toBeEnabled(); blocked.release(); await page.unrouteAll({ behavior: 'wait' });
    await expect(page.getByRole('heading', { name: 'Corrected knit', exact: true })).toBeVisible(); await expect(page.getByText('STALE RESULT MUST NOT APPEAR', { exact: true })).toHaveCount(0);
  } finally { blocked.release(); }
});
test('person upload does not strand a pending garment search', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1); const blocked = gate(), entered = gate();
  await page.route('**/api/search', async route => { const response = await route.fetch(); entered.release(); await blocked.promise; await route.fulfill({ response }); });
  try {
    await page.getByRole('button', { name: 'Search again for Midnight knit', exact: true }).click(); await entered.promise;
    await section(page, info, 2); await page.getByRole('button', { name: 'Your photo', exact: true }).click(); await page.locator('.photo-consent input[type=checkbox]').check();
    await page.getByLabel('Person photo file').setInputFiles('public/demo/base-runway.webp'); await expect(page.getByText('Your photo is selected')).toBeVisible();
    blocked.release(); await page.unrouteAll({ behavior: 'wait' }); await section(page, info, 1);
    await expect(page.getByRole('button', { name: 'Search again for Midnight knit', exact: true })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Select Black ribbed high-neck knit', exact: true })).toBeVisible();
  } finally { blocked.release(); }
});
test('overlapping autosaves cannot overwrite the latest product selection', async ({ page }, info) => {
  await seeded(page); await section(page, info, 1); await page.getByRole('tab', { name: 'bottom', exact: true }).click();
  await saved(page, s => s.activeId === 'demo-bottom'); await page.clock.install();
  const blocked = gate(), entered = gate(); let saves = 0;
  await page.route('**/api/session', async route => {
    if (route.request().method() !== 'PATCH') { await route.continue(); return; }
    saves++; if (saves === 1) { entered.release(); await blocked.promise; } await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Select Burgundy pleated maxi skirt', exact: true }).click(); await page.clock.runFor(500); await entered.promise;
    await page.getByRole('button', { name: 'Select Silver satin pleated maxi skirt', exact: true }).click(); await page.clock.runFor(500);
    expect(saves).toBe(1); blocked.release();
    await expect.poll(() => saves).toBe(2); await saved(page, s => (s.selected as Record<string, string>)['demo-bottom'] === 'fixture-demo-bottom-0');
    await page.reload(); await section(page, info, 1); await expect(page.getByRole('button', { name: 'Select Silver satin pleated maxi skirt', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } finally { blocked.release(); }
});
test('failed session deletion during a pending render keeps the app usable', async ({ page }, info) => {
  await seeded(page); await section(page, info, 2); const blocked = gate(), entered = gate();
  await page.route('**/api/jobs/*', async route => { const response = await route.fetch(); entered.release(); await blocked.promise; await route.fulfill({ response }); });
  await page.route('**/api/session', async route => { if (route.request().method() === 'DELETE') await route.fulfill({ status: 500, json: { error: 'Test deletion failed' } }); else await route.continue(); });
  try {
    await page.locator('.render-button').click(); await entered.promise; await page.getByRole('button', { name: 'Delete my session', exact: true }).click(); await page.getByRole('button', { name: 'Delete session', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Test deletion failed' })).toBeVisible(); blocked.release(); await page.unrouteAll({ behavior: 'wait' });
    await expect(page.locator('.render-button')).toBeEnabled(); await expect(page.locator('.rendering-overlay')).toHaveCount(0);
    await page.locator('.render-button').click(); await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeEnabled();
  } finally { blocked.release(); }
});
