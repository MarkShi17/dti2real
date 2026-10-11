export type SearchOutcome = 'queued' | 'searching' | 'matched' | 'unmatched' | 'failed' | 'skipped';
export type PipelineProgress = {
  runId: number;
  phase: 'analyzing' | 'searching' | 'review' | 'manual' | 'rendering' | 'complete' | 'failed';
  hasAnalysis: boolean;
  sample: boolean;
  startedAt: number | null;
  detail: string;
  failedStage?: 'analyze' | 'tryon';
  items: Record<string, { version: number; outcome: SearchOutcome }>;
};
export type ProgressEvent =
  | { type: 'analyze'; runId: number; now: number; sample: boolean }
  | { type: 'identified'; runId: number; now: number; items: { id: string; version: number }[] }
  | { type: 'search-start'; runId: number; now: number; id: string; version: number }
  | { type: 'invalidate-item'; runId: number; now: number; id: string; version: number }
  | { type: 'search-end'; runId: number; now: number; id: string; version: number; outcome: 'matched' | 'unmatched' | 'failed' }
  | { type: 'tryon'; runId: number; now: number; sample: boolean }
  | { type: 'job'; runId: number; detail: string }
  | { type: 'complete'; runId: number }
  | { type: 'fail'; runId: number; stage: 'analyze' | 'tryon'; detail: string };

export function progressReducer(state: PipelineProgress | null, event: ProgressEvent): PipelineProgress | null {
  if (event.type === 'analyze') return {
    runId: event.runId, phase: 'analyzing', hasAnalysis: true,
    sample: event.sample, startedAt: event.now, detail: '', items: {}
  };
  if (event.type === 'tryon') {
    const hasAnalysis = !!state?.hasAnalysis && (state.phase === 'review' || state.phase === 'complete' || (state.phase === 'failed' && state.failedStage === 'tryon'));
    return { runId: event.runId, phase: 'rendering', hasAnalysis, sample: event.sample,
      startedAt: event.now, detail: 'Preparing your selected outfit', items: hasAnalysis ? state!.items : {} };
  }
  if (!state || state.runId !== event.runId) return state;
  if (event.type === 'identified') {
    if (state.phase !== 'analyzing') return state;
    return { ...state, phase: event.items.length ? 'searching' : 'manual', startedAt: event.items.length ? event.now : null,
      items: Object.fromEntries(event.items.map(({ id, version }) => [id, { version, outcome: 'queued' as const }])) };
  }
  if (event.type === 'job') return state.phase === 'rendering' ? { ...state, detail: event.detail } : state;
  if (event.type === 'complete') return state.phase === 'rendering' ? { ...state, phase: 'complete', startedAt: null, detail: '' } : state;
  if (event.type === 'fail') {
    if ((event.stage === 'analyze' && state.phase !== 'analyzing') || (event.stage === 'tryon' && state.phase !== 'rendering')) return state;
    return { ...state, phase: 'failed', failedStage: event.stage, startedAt: null, detail: event.detail };
  }
  // Item searches may change while matches are being reviewed. They must never
  // overwrite rendering, completion, or another run's progress.
  if (!['searching', 'review', 'manual'].includes(state.phase)) return state;
  const previous = state.items[event.id];
  if (event.type === 'search-end') {
    if (!previous || previous.version !== event.version || previous.outcome !== 'searching') return state;
  } else if (previous && (event.version < previous.version || (event.type === 'invalidate-item' && event.version === previous.version))) return state;
  if (event.type === 'invalidate-item' && !previous) return state;
  const outcome: SearchOutcome = event.type === 'search-start' ? 'searching' : event.type === 'invalidate-item' ? 'skipped' : event.outcome;
  const items = { ...state.items, [event.id]: { version: event.version, outcome } };
  const pending = Object.values(items).some(item => item.outcome === 'queued' || item.outcome === 'searching');
  return { ...state, items, phase: pending ? 'searching' : 'review',
    startedAt: pending ? (state.phase === 'searching' ? state.startedAt : event.now) : null };
}
export function pipelineCounts(state: PipelineProgress) {
  const counts = { total: Object.keys(state.items).length, checked: 0, matched: 0, unmatched: 0, failed: 0, skipped: 0 };
  for (const { outcome } of Object.values(state.items)) {
    if (outcome === 'queued' || outcome === 'searching') continue;
    counts.checked++; counts[outcome]++;
  }
  return counts;
}
export function pipelineUnits(state: PipelineProgress) {
  if (!state.hasAnalysis) return state.phase === 'complete' ? 1 : 0;
  if (state.phase === 'analyzing' || state.failedStage === 'analyze') return 0;
  if (state.phase === 'complete') return 3;
  const { total, checked } = pipelineCounts(state);
  return 1 + (total ? checked / total : 0);
}
