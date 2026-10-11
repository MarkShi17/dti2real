import { describe, expect, it } from 'vitest';
import { pipelineCounts, pipelineUnits, progressReducer, type PipelineProgress } from '@/lib/pipeline-progress';

function analysis(ids = ['top', 'bottom', 'shoes', 'bag', 'jewelry']) {
  let state = progressReducer(null, { type: 'analyze', runId: 1, now: 1000, sample: false });
  state = progressReducer(state, { type: 'identified', runId: 1, now: 2000, items: ids.map(id => ({ id, version: 0 })) });
  return state!;
}
function settle(state: PipelineProgress, id: string, outcome: 'matched' | 'unmatched' | 'failed' = 'matched', version = 1) {
  const started = progressReducer(state, { type: 'search-start', runId: 1, now: 3000, id, version });
  return progressReducer(started, { type: 'search-end', runId: 1, now: 4000, id, version, outcome })!;
}

describe('pipeline progress', () => {
  it('keeps the search stage active between batches while counting every queued item', () => {
    let state = analysis();
    state = settle(state, 'top'); state = settle(state, 'bottom');
    expect(state.phase).toBe('searching');
    expect(pipelineCounts(state)).toEqual({ total: 5, checked: 2, matched: 2, unmatched: 0, failed: 0, skipped: 0 });
    expect(pipelineUnits(state)).toBeCloseTo(1.4);
    expect(state.startedAt).toBe(2000);
  });

  it('finishes with separate matched, empty, and failed counts rather than reporting every item as matched', () => {
    let state = analysis(['top', 'bottom', 'shoes']);
    state = settle(state, 'top'); state = settle(state, 'bottom', 'unmatched'); state = settle(state, 'shoes', 'failed');
    expect(state.phase).toBe('review'); expect(state.startedAt).toBeNull();
    expect(pipelineCounts(state)).toEqual({ total: 3, checked: 3, matched: 1, unmatched: 1, failed: 1, skipped: 0 });
    expect(pipelineUnits(state)).toBe(2);
  });

  it('ignores an outdated response after a garment edit and lets the replacement search finish', () => {
    let state = analysis(['top', 'bottom']);
    state = progressReducer(state, { type: 'search-start', runId: 1, now: 3000, id: 'top', version: 1 })!;
    state = progressReducer(state, { type: 'invalidate-item', runId: 1, now: 4000, id: 'top', version: 2 })!;
    state = progressReducer(state, { type: 'search-start', runId: 1, now: 5000, id: 'top', version: 3 })!;
    const outdated = progressReducer(state, { type: 'search-end', runId: 1, now: 6000, id: 'top', version: 1, outcome: 'matched' });
    expect(outdated).toBe(state); expect(pipelineCounts(state).checked).toBe(0);
    state = settle(state, 'bottom'); state = settle(state, 'top', 'matched', 3);
    expect(state.phase).toBe('review'); expect(pipelineCounts(state).matched).toBe(2);
  });

  it('settles invalidated queued items without waiting for a request that will never start', () => {
    let state = analysis(['top', 'shoes']); state = settle(state, 'top');
    state = progressReducer(state, { type: 'invalidate-item', runId: 1, now: 4000, id: 'shoes', version: 1 })!;
    expect(state.phase).toBe('review'); expect(pipelineCounts(state).skipped).toBe(1);
  });

  it('does not double-count duplicate responses or let old runs resurrect cleared progress', () => {
    const state = settle(analysis(['top']), 'top');
    const duplicate = progressReducer(state, { type: 'search-end', runId: 1, now: 6000, id: 'top', version: 1, outcome: 'matched' })!;
    expect(pipelineCounts(duplicate).checked).toBe(1);
    expect(progressReducer(null, { type: 'search-end', runId: 1, now: 6000, id: 'top', version: 1, outcome: 'matched' })).toBeNull();
    const newer = progressReducer(state, { type: 'analyze', runId: 2, now: 7000, sample: false });
    expect(progressReducer(newer, { type: 'identified', runId: 1, now: 8000, items: [] })).toBe(newer);
  });

  it('leaves manual recognition without fake search completion or a running timer', () => {
    const state = analysis([]);
    expect(state.phase).toBe('manual'); expect(state.startedAt).toBeNull(); expect(pipelineUnits(state)).toBe(1);
  });

  it('preserves the roadmap during try-on but ignores background searches and stale job updates', () => {
    const reviewed = settle(analysis(['top']), 'top');
    let state = progressReducer(reviewed, { type: 'tryon', runId: 2, now: 8000, sample: false })!;
    expect(state.hasAnalysis).toBe(true); expect(pipelineUnits(state)).toBe(2);
    expect(progressReducer(state, { type: 'search-end', runId: 1, now: 9000, id: 'top', version: 1, outcome: 'failed' })).toBe(state);
    state = progressReducer(state, { type: 'job', runId: 2, detail: 'Trying on midnight knit' })!;
    expect(state.detail).toBe('Trying on midnight knit'); expect(state.startedAt).toBe(8000);
    state = progressReducer(state, { type: 'complete', runId: 2 })!;
    expect(state.phase).toBe('complete'); expect(pipelineUnits(state)).toBe(3); expect(state.startedAt).toBeNull();
    expect(progressReducer(state, { type: 'job', runId: 2, detail: 'Old update' })).toBe(state);
  });

  it('shows only try-on when rendering a restored session and completes cached previews immediately', () => {
    const state = progressReducer(null, { type: 'tryon', runId: 1, now: 1000, sample: true })!;
    expect(state.hasAnalysis).toBe(false); expect(pipelineUnits(state)).toBe(0);
    const done = progressReducer(state, { type: 'complete', runId: 1 })!;
    expect(pipelineUnits(done)).toBe(1); expect(done.phase).toBe('complete');
  });

  it('stops elapsed time on failure without advancing the failed stage', () => {
    const state = progressReducer(analysis(['top']), { type: 'tryon', runId: 2, now: 8000, sample: false });
    const failed = progressReducer(state, { type: 'fail', runId: 2, stage: 'tryon', detail: 'Provider unavailable' })!;
    expect(failed.phase).toBe('failed'); expect(failed.startedAt).toBeNull(); expect(failed.detail).toBe('Provider unavailable');
    expect(pipelineUnits(failed)).toBeLessThan(3);
  });
});
