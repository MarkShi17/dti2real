import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluationEnv } from './env.mjs';
import { guardedFetch, saveJson } from './transport.mjs';
if(!process.argv.includes('--live'))throw new Error('Alexandria probes require --live.');
const env=evaluationEnv(),dir='.accuracy/alexandria';mkdirSync(dir,{recursive:true});
const guarded=guardedFetch({live:true,phase:'pilot',secrets:[env.FIRECRAWL_API_KEY]});
const headers={Authorization:'Bearer '+env.FIRECRAWL_API_KEY,'Content-Type':'application/json'};
for(const call of [
 {provider:'shopify',capability:'catalog/search_catalog',options:{query:'pure white solid fitted camisole top thin straps',country:'US',limit:6}},
 {provider:'nike-com',capability:'products/search',options:{query:'white high top sneakers',country:'US',count:24}}
]){
 const path=dir+'/'+call.provider+'.json';if(existsSync(path))continue;
 const contractPath='.accuracy/alexandria-contract-'+call.provider+'.json';
 if(!existsSync(contractPath)){
  const lookup=await guarded('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers,body:JSON.stringify({alexandria:{provider:'firecrawl',capability:'find-tools',options:{providers:[call.provider],capabilities:[call.capability],expand:['options','response','examples'],limit:2}}}),signal:AbortSignal.timeout(30000)});
  const result=await lookup.json();
  if(!lookup.ok)throw new Error('Alexandria contract discovery failed: HTTP '+lookup.status);
  saveJson(contractPath,result);
 }
 const contract=JSON.parse(readFileSync(contractPath,'utf8')).data.alexandria[0].data.items[0];
 if(contract.creditsCost!==5||contract.perRecord!==false)throw new Error('Alexandria pricing changed; recheck before dispatch.');
 const body={alexandria:call},start=Date.now(),requestId=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const r=await guarded('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{...headers,'x-request-id':requestId},body:JSON.stringify(body),signal:AbortSignal.timeout(80000)});
 const data=await r.json();saveJson(path,{provider:call.provider,caseId:'fit10',query:call.options.query,status:r.status,elapsedMs:Date.now()-start,data});
 console.log(JSON.stringify({provider:call.provider,status:r.status,credits:data.data?.creditsCost,error:data.error||data.data?.alexandria?.[0]?.error}));
}
