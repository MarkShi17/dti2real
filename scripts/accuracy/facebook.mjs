import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { evaluationEnv } from './env.mjs';
import { guardedFetch, saveJson } from './transport.mjs';
const path='.accuracy/facebook/probe.json';
mkdirSync('.accuracy/facebook',{recursive:true});
if(existsSync(path)){console.log(readFileSync(path,'utf8'));process.exit(0);}
const env=evaluationEnv();
const guarded=guardedFetch({live:process.argv.includes('--live'),phase:'pilot',secrets:[env.APIFY_TOKEN]});
const headers={Authorization:'Bearer '+env.APIFY_TOKEN,'Content-Type':'application/json'};
const input={searchQueries:['black platform Mary Jane shoes'],locations:['sanfrancisco'],maxItems:6,includeDetails:false,countryCode:'US',proxy:'RESIDENTIAL',delayMs:1500,navTimeoutMs:45000,keepDebugHtml:false};
const started=Date.now();
const response=await guarded('https://api.apify.com/v2/acts/leadproof~facebook-marketplace/runs?timeout=120&maxItems=6&maxTotalChargeUsd=0.05',{method:'POST',headers,body:JSON.stringify(input)});
const payload=await response.json();
if(!response.ok){const report={actor:'leadproof/facebook-marketplace',input,status:response.status,error:payload.error?.message||'Request failed',count:0,elapsedMs:Date.now()-started,note:'Public actor probe failed before returning listings; not a successful scrape.'};saveJson(path,report);console.log(JSON.stringify(report));process.exit(0);}
let run=payload.data;
for(let i=0;i<70&&!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(run.status);i++){
 await new Promise(resolve=>setTimeout(resolve,2000));
 const result=await guarded('https://api.apify.com/v2/actor-runs/'+run.id,{headers,signal:AbortSignal.timeout(30000)});
 if(!result.ok)throw new Error('Facebook status HTTP '+result.status);
 run=(await result.json()).data;
}
let rows=[];
if(run.defaultDatasetId){
 const result=await guarded('https://api.apify.com/v2/datasets/'+run.defaultDatasetId+'/items?clean=true&limit=6',{headers,signal:AbortSignal.timeout(30000)});
 if(result.ok)rows=await result.json();
}
const report={actor:'leadproof/facebook-marketplace',input,runId:run.id,status:run.status,reportedUsd:run.usageTotalUsd,elapsedMs:Date.now()-started,count:rows.length,listings:rows.map(p=>({title:p.title,url:p.listing_url,price:p.price,currency:p.currency,location:p.location_name})),note:'One exploratory public search, not a scored accuracy source. No account cookies or login supplied.'};
saveJson(path,report);console.log(JSON.stringify(report,null,2));
