import { afterEach, expect, it, vi } from 'vitest';
import { presentAfter, runExampleJourney } from '@/lib/example-journey';
import { EXAMPLE_GARMENTS, EXAMPLE_PRODUCTS, EXAMPLE_TIMING } from '@/lib/examples';
import type { RenderResult } from '@/lib/schema';

afterEach(() => vi.useRealTimers());

it('stages warm results over fifteen seconds and renders the actual returned selection', async () => {
  vi.useFakeTimers();
  const events: string[] = [];
  const render = vi.fn(async () => ({ id: 'result' }) as RenderResult);
  const journey = runExampleJourney({ signal: new AbortController().signal, timing: EXAMPLE_TIMING,
    analyze: async () => EXAMPLE_GARMENTS,
    search: async g => EXAMPLE_PRODUCTS.filter(p => p.garmentId === g.id), render,
    identified: () => events.push('identified'), searchStarted: () => {},
    matched: g => events.push(g.id), rendering: () => events.push('rendering'),
    completed: () => events.push('completed'),
  });
  await vi.advanceTimersByTimeAsync(2999); expect(events).toEqual([]);
  await vi.advanceTimersByTimeAsync(1); expect(events).toEqual(['identified']);
  await vi.advanceTimersByTimeAsync(4000); expect(events).toHaveLength(6);
  expect(render).toHaveBeenCalledWith(EXAMPLE_GARMENTS, Object.fromEntries(EXAMPLE_PRODUCTS.map(p => [p.garmentId, p.id])));
  await vi.advanceTimersByTimeAsync(7999); expect(events).not.toContain('completed');
  await vi.advanceTimersByTimeAsync(1); await journey; expect(events.at(-1)).toBe('completed');
});

it('cancels a cached reveal without starting later requests or calling completion', async () => {
  vi.useFakeTimers(); const controller = new AbortController(), search = vi.fn(), completed = vi.fn();
  const journey = runExampleJourney({ signal: controller.signal, timing: EXAMPLE_TIMING,
    analyze: async () => EXAMPLE_GARMENTS, search, render: vi.fn(),
    identified: vi.fn(), searchStarted: vi.fn(), matched: vi.fn(), rendering: vi.fn(), completed,
  });
  const rejection = expect(journey).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); await rejection; await vi.runAllTimersAsync();
  expect(search).not.toHaveBeenCalled(); expect(completed).not.toHaveBeenCalled();
});

it('does not begin rendering if a required piece has no sample match', async () => {
  const render = vi.fn();
  await expect(runExampleJourney({ signal: new AbortController().signal, timing: { analysis: 0, searchBatch: 0, render: 0 },
    analyze: async () => EXAMPLE_GARMENTS, search: async () => [], render,
    identified: vi.fn(), searchStarted: vi.fn(), matched: vi.fn(), rendering: vi.fn(), completed: vi.fn(),
  })).rejects.toThrow('sample match'); expect(render).not.toHaveBeenCalled();
});

it('holds a cached pose for its minimum presentation time', async () => {
  vi.useFakeTimers(); const completed = vi.fn();
  const result = presentAfter(() => Promise.resolve('pose'), 2500, new AbortController().signal).then(completed);
  await vi.advanceTimersByTimeAsync(2499); expect(completed).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await result; expect(completed).toHaveBeenCalledWith('pose');
});
