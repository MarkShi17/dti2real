import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, openSync, closeSync, unlinkSync, mkdirSync } from 'node:fs';
import { evaluationEnv } from './env.mjs';
const args=process.argv.slice(2),phase=args.find(a=>!a.startsWith('--'))||'status';
if(phase==='report'){
 const r=spawnSync(process.execPath,['scripts/accuracy/report.mjs'],{stdio:'inherit'});process.exitCode=r.status??1;
}else if(phase==='status'){
 const ledger=existsSync('.accuracy/ledger.json')?JSON.parse(readFileSync('.accuracy/ledger.json','utf8')):null;
 console.log(ledger ? 'Accuracy evaluation: '+ledger.entries.length+' requests; $'+ledger.entries.reduce((s,e)=>s+(e.actual??e.reserved),0).toFixed(4)+' accounted / $'+ledger.cap+' cap.' : 'No paid requests yet.');
 console.log('Run: npm run eval:accuracy -- preflight --live');
}else{
 if(!['preflight','pilot','baseline','retest','shopping','rerank','mixed','shopping-all','rerank-all','judge','facebook','firecrawl','strict','alexandria','workarounds','probes'].includes(phase))throw new Error('Unknown evaluation phase.');
 if(!args.includes('--live'))throw new Error('Live requests require --live.');
 mkdirSync('.accuracy',{recursive:true});
 const lock=openSync('.accuracy/run.lock','wx');
 try{
  const env={...process.env,...evaluationEnv(),ACCURACY_LIVE:'true',ACCURACY_PHASE:phase,SHOPPING_PROVIDERS:phase.endsWith('-all')?'serper,depop,grailed':'serper,grailed',DATA_DIR:process.cwd()+'/.accuracy/data'};
  if(phase==='preflight'){
   const check=spawnSync(process.execPath,['scripts/accuracy/preflight.mjs'],{env,stdio:'inherit'});
   if(check.status!==0)throw new Error('Provider preflight failed; no inference dispatched.');
  }
  const run=spawnSync(process.execPath,phase==='pilot'?['scripts/accuracy/pilot.mjs','--live']:phase==='facebook'?['scripts/accuracy/facebook.mjs','--live']:phase==='firecrawl'?['scripts/accuracy/firecrawl.mjs','--live']:phase==='alexandria'?['scripts/accuracy/alexandria.mjs','--live']:phase==='workarounds'?['scripts/accuracy/workarounds.mjs','--live']:['node_modules/vitest/vitest.mjs','run','--config','vitest.accuracy.config.ts'],{env,stdio:'inherit'});
  process.exitCode=run.status??1;
 }finally{closeSync(lock);unlinkSync('.accuracy/run.lock');}
}
