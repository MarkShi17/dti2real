import { test as base, expect, type Page, type APIRequestContext, type TestInfo } from '@playwright/test';
import { DEMO_GARMENTS } from '../../src/lib/fixtures';
import { defaultFilters, type Garment } from '../../src/lib/schema';

export { expect, DEMO_GARMENTS, defaultFilters };
export const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [async ({ page }, use) => {
    const started = Date.now();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try { await use(errors); expect(errors, 'No unhandled application exceptions').toEqual([]); }
    finally {
      await page.request.delete('/api/session').catch(() => {});
      // Deliberate load pacing: four browsers share the unmodified production
      // session/global limits. This is not a wait for application readiness.
      const remaining = 4000 - (Date.now() - started);
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }, { auto: true }],
});

export async function section(page: Page, info: TestInfo, step: number) {
  if (info.project.name.includes('mobile')) await page.getByRole('button', { name: ['1 Inspiration', '2 Find pieces', '3 Fitting room'][step], exact: true }).click();
}
export async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Explore an example', exact: true })).toBeEnabled();
}
export async function seed(request: APIRequestContext, garments: Garment[] = DEMO_GARMENTS, categories = ['top', 'bottom']) {
  expect((await request.post('/api/session')).ok()).toBe(true);
  const selected: Record<string, string> = {};
  for (const garment of garments.filter(g => categories.includes(g.category))) {
    const response = await request.post('/api/search', { data: { garment, filters: defaultFilters } });
    expect(response.ok(), await response.text()).toBe(true);
    selected[garment.id] = (await response.json()).products[0].id;
  }
  const state = { screenshotId: 'sample', personId: 'studio', garments, selected, activeId: garments[0]?.id || null, renderId: null };
  expect((await request.patch('/api/session', { data: state })).ok()).toBe(true);
  return state;
}
export async function seeded(page: Page) { await seed(page.request); await ready(page); }
export async function render(page: Page, info: TestInfo) {
  await section(page, info, 2); await page.locator('.render-button').click();
  await expect(page.getByRole('button', { name: 'Hand on hip', exact: true })).toBeEnabled();
}
export async function saved(page: Page, predicate: (state: Record<string, unknown>) => boolean) {
  await expect.poll(async () => { const response = await page.request.get('/api/session'); return response.ok() && predicate((await response.json()).state || {}); }).toBe(true);
}
export function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
export async function waitJob(request: APIRequestContext, initial: Record<string, unknown>) {
  let job = initial;
  await expect.poll(async () => {
    if (job.status === 'queued' || job.status === 'running') job = await (await request.get(`/api/jobs/${job.id}`)).json();
    return job.status;
  }, { timeout: 20000, intervals: [100, 250, 500] }).toMatch(/completed|failed/);
  return job;
}
