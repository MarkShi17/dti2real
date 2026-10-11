'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { progressReducer, type PipelineProgress, type ProgressEvent } from '@/lib/pipeline-progress';

/** Observes existing requests; never queues, cancels, or persists pipeline work. */
export function usePipelineProgress() {
  const [pipeline, setPipeline] = useState<PipelineProgress | null>(null);
  const runId = useRef(0);
  const report = useCallback((event: ProgressEvent) => setPipeline(state => progressReducer(state, event)), []);
  const clear = useCallback(() => { runId.current++; setPipeline(null); }, []);
  const beginAnalysis = useCallback((sample: boolean) => {
    const id = ++runId.current;
    report({ type: 'analyze', runId: id, now: Date.now(), sample });
    return id;
  }, [report]);
  const beginTryon = useCallback((sample: boolean) => {
    const id = ++runId.current;
    report({ type: 'tryon', runId: id, now: Date.now(), sample });
    return id;
  }, [report]);
  const completedRun = pipeline?.phase === 'complete' ? pipeline.runId : null;
  useEffect(() => {
    if (completedRun === null) return;
    const timer = setTimeout(() => setPipeline(state => state?.runId === completedRun && state.phase === 'complete' ? null : state), 3000);
    return () => clearTimeout(timer);
  }, [completedRun]);
  return { pipeline, runId, report, clear, beginAnalysis, beginTryon };
}
