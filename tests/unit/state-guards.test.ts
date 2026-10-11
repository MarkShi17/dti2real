import { expect, it } from 'vitest';
import { queuedSearchIsCurrent, baseRenderFor, createSaveQueue } from '@/lib/state-guards';
import type { RenderResult } from '@/lib/schema';
it('does not start an outdated queued garment search after a manual edit', () => {
  expect(queuedSearchIsCurrent('shoes', { shoes: 2 }, { shoes: 0 })).toBe(false);
  expect(queuedSearchIsCurrent('shoes', {}, {})).toBe(true);
});
it('poses derive from the selected generation, not the oldest neutral', () => {
  const a = { id: 'A', baseRenderId: 'A', pose: 'runway', outfitKey: 'same' } as RenderResult;
  const b = { ...a, id: 'B', baseRenderId: 'B' };
  const posed = { ...b, id: 'C', pose: 'hip' } as RenderResult;
  expect(baseRenderFor(posed, [a,b,posed]).id).toBe('B');
});
it('serializes autosaves so a slow older save cannot overwrite a newer one', async () => {
  const enqueue = createSaveQueue(), order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const a = enqueue(async () => { await gate; order.push('old'); });
  const b = enqueue(async () => { order.push('new'); });
  await Promise.resolve(); expect(order).toEqual([]); release(); await Promise.all([a,b]); expect(order).toEqual(['old','new']);
});
