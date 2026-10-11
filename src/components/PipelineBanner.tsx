'use client';
import { useEffect, useState } from 'react';
import { Check, ScanLine, Search, Shirt, TriangleAlert } from 'lucide-react';
import { pipelineCounts, pipelineUnits, type PipelineProgress } from '@/lib/pipeline-progress';
import styles from './PipelineBanner.module.css';

export function PipelineBanner({ progress, demoSearch = false, manualAnalysis = false }: { progress: PipelineProgress | null; demoSearch?: boolean; manualAnalysis?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const startedAt = progress?.startedAt;
  useEffect(() => {
    if (startedAt === null || startedAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (!progress) return null;

  const { phase, sample, hasAnalysis } = progress;
  const counts = pipelineCounts(progress), units = pipelineUnits(progress);
  const active = progress.startedAt !== null;
  const elapsed = progress.startedAt !== null ? Math.max(0, Math.floor((now - progress.startedAt) / 1000)) : 0;
  const titles = {
    analyzing: sample ? 'Reading the sample outfit' : manualAnalysis ? 'Checking your outfit setup' : 'Identifying & separating items',
    searching: demoSearch ? 'Finding sample matches' : 'Finding real-world matches',
    review: counts.matched ? 'Your matches are ready' : 'Review your search results',
    manual: 'Add items manually to continue',
    rendering: sample ? 'Preparing your sample preview' : 'Creating your try-on',
    complete: 'Your preview is ready',
    failed: progress.failedStage === 'analyze' ? 'Outfit analysis stopped' : 'Try-on stopped'
  };
  const details = {
    analyzing: sample ? 'Reading the sample’s garment regions.' : manualAnalysis ? 'Checking the screenshot before manual review.' : 'Reading clothing, colors, and garment regions.',
    searching: `${counts.checked} of ${counts.total} items checked`,
    review: counts.matched ? 'Choose your pieces, then select Try on this fit.' : 'Review each item and search again to find matches.',
    manual: 'Add a piece and draw its region, or explore an example.',
    rendering: progress.detail,
    complete: sample ? 'Your sample look is ready in the fitting room.' : 'Your look is ready in the fitting room.',
    failed: `${progress.detail} ${progress.failedStage === 'analyze' ? 'Select Analyze outfit to retry.' : 'Select Try on this fit to retry.'}`
  };
  const title = titles[phase], detail = details[phase];
  const stages = hasAnalysis ? [
    { label: manualAnalysis ? 'Check outfit' : 'Identify & separate', icon: ScanLine },
    { label: 'Find matches', icon: Search },
    { label: 'Create try-on', icon: Shirt }
  ] : [{ label: 'Create try-on', icon: Shirt }];
  const currentStage = !hasAnalysis ? 0 : phase === 'analyzing' || progress.failedStage === 'analyze' ? 0 : phase === 'searching' || phase === 'manual' ? 1 : 2;
  const outcomeText = [
    `${counts.matched} matched`,
    counts.unmatched ? `${counts.unmatched} without matches` : '',
    counts.failed ? `${counts.failed} failed` : '',
    counts.skipped ? `${counts.skipped} changed` : ''
  ].filter(Boolean).join(' · ');
  const hasIssues = counts.unmatched + counts.failed + counts.skipped > 0;

  return <section aria-label="Outfit progress" className={`${styles.banner} ${active ? styles.active : ''}`} data-phase={phase}>
    <div className={styles.heading}>
      <div className={styles.copy} aria-live="polite" aria-atomic="true">
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.detail}>{detail}</p>
      </div>
      {active && <span className={styles.elapsed} data-testid="pipeline-elapsed" aria-live="off">Elapsed {elapsed}s</span>}
      {phase === 'complete' && <Check size={22} className={styles.success} aria-hidden="true"/>}
      {phase === 'failed' && <TriangleAlert size={20} aria-hidden="true"/>}
    </div>
    <div className={styles.track} role="progressbar" aria-label="Outfit processing progress" aria-valuemin={0} aria-valuemax={stages.length} aria-valuenow={units} aria-valuetext={`${title}. ${detail}`}>
      {stages.map((stage, index) => <span key={stage.label} className={`${styles.segment} ${active && currentStage === index ? styles.processing : ''}`} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${Math.max(0, Math.min(1, units - index)) * 100}%` }}/>
      </span>)}
    </div>
    <ol className={styles.stages} aria-label="Processing stages">
      {stages.map(({ label, icon: Icon }, index) => {
        const done = units >= index + 1, working = active && index === currentStage;
        const stopped = phase === 'failed' && index === currentStage;
        const awaiting = (phase === 'review' && index === 2) || (phase === 'manual' && index === 1);
        return <li key={label} className={`${styles.stage} ${done ? styles.done : ''} ${working ? styles.working : ''}`} aria-current={working ? 'step' : undefined}>
          <span className={styles.marker} aria-hidden="true">{done ? <Check size={13}/> : stopped ? <TriangleAlert size={13}/> : <Icon size={13}/>}</span>
          <span><span className={styles.label}>{label}</span><small>{done ? 'Done' : working ? 'In progress' : stopped ? 'Stopped' : awaiting ? 'When you’re ready' : 'Up next'}</small></span>
        </li>;
      })}
    </ol>
    {counts.checked > 0 && <div className={styles.outcomes}>
      <p>{outcomeText}</p>
      {hasIssues && phase === 'review' && <p className={styles.guidance}>Search again for items without matches or failed searches. Review any changed pieces.</p>}
    </div>}
    {active && elapsed >= 30 && <p className={styles.slow} aria-live="polite">Still waiting for this step to finish.</p>}
  </section>;
}
