import { spawnSync } from 'node:child_process';
import { openSync, closeSync, unlinkSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { evaluationEnv } from '../accuracy/env.mjs';
import { saveJson } from '../accuracy/transport.mjs';
const phase = process.argv[2];
if (phase === 'report') {
  process.exit(spawnSync(process.execPath, ['scripts/search-precision/report.mjs'], { stdio: 'inherit' }).status ?? 1);
}
if (!['plan', 'image-plan', 'retrieve', 'verify', 'judge', 'details'].includes(phase) || !process.argv.includes('--live')) throw new Error('Use: node scripts/search-precision/run.mjs plan|image-plan|retrieve|verify|judge|details --live');
mkdirSync('.accuracy/search-v2', { recursive: true });
const lock = openSync('.accuracy/search-v2/run.lock', 'wx');
try {
  const ledgerPath = '.accuracy/ledger.json';
  const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { cap: 6, pilotCap: 5, entries: [] };
  const previousAccounted = ledger.entries.filter(e => !e.phase?.startsWith('search-v2-')).reduce((sum, e) => sum + (e.actual ?? e.reserved), 0);
  ledger.cap = Math.min(ledger.cap, previousAccounted + 6);
  saveJson(ledgerPath, ledger);
  saveJson('.accuracy/search-v2/budget.json', { previousAccounted, requestedIncrementalCap: 6, incrementalCap: Math.max(0, Math.min(6, ledger.cap - previousAccounted)), cumulativeCap: ledger.cap });
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'scripts/search-precision/vitest.config.ts'], {
    stdio: 'inherit', env: { ...process.env, ...evaluationEnv(), SEARCH_PRECISION_PHASE: phase, ACCURACY_LIVE: 'true' },
  });
  process.exitCode = result.status ?? 1;
} finally { closeSync(lock); unlinkSync('.accuracy/search-v2/run.lock'); }
