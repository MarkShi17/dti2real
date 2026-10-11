import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardedFetch } from '../../scripts/accuracy/transport.mjs';
it('checkpoints before dispatch, caches successes, and never retries an uncertain paid request', async () => {
 const dir=mkdtempSync(join(tmpdir(),'dti-budget-'));
 try {
  let calls=0;
  const fetcher=guardedFetch({dir,live:true,phase:'preflight',secrets:['secret'],fetchImpl:async () => {
   calls++;
   const ledger=JSON.parse(readFileSync(join(dir,'ledger.json'),'utf8'));
   expect(ledger.entries[0].status).toBe('pending');
   return Response.json({choices:[],cheaper_inference:{billing:{billed_cost_usd:"0.01"}}});
  }});
  const req={method:'POST',body:JSON.stringify({model:'gpt-5.4',messages:[]}),headers:{Authorization:'Bearer secret'}};
  await fetcher('https://api.cheaperinference.com/v1/chat/completions',req);
  await fetcher('https://api.cheaperinference.com/v1/chat/completions',req);
  expect(calls).toBe(1);
  const failed=guardedFetch({dir,live:true,phase:'baseline',fetchImpl:async()=>{throw new Error('lost connection');}});
  const other={...req,body:JSON.stringify({model:'gpt-5.4',messages:[{content:'different'}]})};
  await expect(failed('https://api.cheaperinference.com/v1/chat/completions',other)).rejects.toThrow();
  await expect(failed('https://api.cheaperinference.com/v1/chat/completions',other)).rejects.toThrow(/pending|uncertain/i);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
it('rejects paid calls without live opt-in', async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dti-offline-'));
 try { await expect(guardedFetch({dir,live:false})('https://google.serper.dev/shopping',{method:'POST',body:'{}'})).rejects.toThrow(/live/i); }
 finally {rmSync(dir,{recursive:true,force:true});}
});

it('polls changing Apify run status instead of replaying cached RUNNING forever',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dti-poll-'));
 try {
  let calls=0;
  const f=guardedFetch({dir,live:true,fetchImpl:async()=>Response.json({data:{id:'run',status:++calls===1?'RUNNING':'SUCCEEDED',usageTotalUsd:0}})});
  const url='https://api.apify.com/v2/actor-runs/run';
  expect((await (await f(url)).json()).data.status).toBe('RUNNING');
  expect((await (await f(url)).json()).data.status).toBe('SUCCEEDED');
 } finally {rmSync(dir,{recursive:true,force:true});}
});

it('budgets only bounded Firecrawl markdown scrapes and rejects unpriced options',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dti-firecrawl-'));
 try {
  let calls=0;
  const f=guardedFetch({dir,live:true,phase:'pilot',fetchImpl:async()=>{calls++;return Response.json({success:true,data:{markdown:'Product'}});}});
  const body={url:'https://www.depop.com/products/example/',formats:['markdown'],parsers:[],onlyMainContent:true,timeout:30000,proxy:'basic',skipTlsVerification:false};
  await f('https://api.firecrawl.dev/v2/scrape',{method:'POST',body:JSON.stringify(body)});
  const ledger=JSON.parse(readFileSync(join(dir,'ledger.json'),'utf8'));
  expect(ledger.entries[0].actual).toBe(.005);
  await expect(f('https://api.firecrawl.dev/v2/scrape',{method:'POST',body:JSON.stringify({...body,formats:['json']})})).rejects.toThrow(/Firecrawl/);
  await expect(f('https://api.firecrawl.dev/v2/scrape',{method:'POST',body:JSON.stringify({...body,actions:[{type:'wait',milliseconds:1000}]})})).rejects.toThrow(/Firecrawl/);
  expect(calls).toBe(1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('serializes inference reservations and preserves a smaller output allowance',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dti-serial-'));
 try{
  let active=0,peak=0;
  const f=guardedFetch({dir,live:true,fetchImpl:async(_url,init)=>{
   active++;peak=Math.max(peak,active);
   expect(JSON.parse(String(init!.body)).max_completion_tokens).toBe(1800);
   await new Promise(resolve=>setTimeout(resolve,5));active--;
   return Response.json({cheaper_inference:{billing:{billed_cost_usd:'0.01'}}});
  }});
  await Promise.all([1,2].map(n=>f('https://api.cheaperinference.com/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'gpt-5.4',max_completion_tokens:1800,messages:[{content:String(n)}]})})));
  expect(peak).toBe(1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('retains the full Firecrawl reservation when enhanced usage is unreported',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dti-enhanced-'));
 try{
  const f=guardedFetch({dir,live:true,fetchImpl:async()=>Response.json({success:true,data:{markdown:'Listing'}})});
  await f('https://api.firecrawl.dev/v2/scrape',{method:'POST',body:JSON.stringify({url:'https://www.ebay.com/itm/123456789012',formats:['markdown'],parsers:[],timeout:30000,proxy:'enhanced'})});
  const entry=JSON.parse(readFileSync(join(dir,'ledger.json'),'utf8')).entries[0];
  expect(entry.status).toBe('pending');expect(entry.reserved).toBe(.05);expect(entry.actual).toBeUndefined();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
