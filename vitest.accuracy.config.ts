import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
 test:{include:[process.env.ACCURACY_PHASE==='judge'?'scripts/accuracy/judge.test.ts':process.env.ACCURACY_PHASE==='probes'?'scripts/accuracy/probes.test.ts':'scripts/accuracy/live.test.ts'],environment:'node',testTimeout:2400000,fileParallelism:false}
});
