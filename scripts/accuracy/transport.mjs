import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { SpendLedger, cacheKey, redact } from './core.mjs';
export function saveJson(path, value) {
 writeFileSync(path+'.tmp', JSON.stringify(value,null,2), {mode:0o600});
 renameSync(path+'.tmp',path);
}
export function guardedFetch({dir='.accuracy',live=false,phase='baseline',secrets=[],fetchImpl=globalThis.fetch,cap=30}={}) {
 mkdirSync(join(dir,'cache'),{recursive:true});
 const ledgerPath=join(dir,'ledger.json');
 const readLedger=()=>new SpendLedger(existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath,'utf8')):{cap,pilotCap:Math.min(5,cap)});
 const request = async (input, init={})=>{
  const url=new URL(String(input)), method=(init.method||'GET').toUpperCase();
  let body=typeof init.body==='string'?JSON.parse(init.body):undefined;
  let amount=0,kind='read';
  if(url.hostname==='serpapi.com' && method==='GET'){amount=.025;kind='serpapi';}
  if(method!=='GET'){
   if(url.hostname==='api.cheaperinference.com' && url.pathname==='/v1/chat/completions'){
    if(body?.model!=='gpt-5.4')throw new Error('Recheck model pricing before changing the evaluation model.');
    body={...body,max_completion_tokens:Math.min(body.max_completion_tokens||6000,6000)}; delete body.max_tokens;
    if(JSON.stringify(body).length>4_300_000)throw new Error('Evaluation vision payload exceeds budgeted size.');
    amount=.25;kind='vision';
   }else if(url.hostname==='google.serper.dev' && ['/shopping','/search'].includes(url.pathname)){amount=.002;kind='serper';}
   else if(url.hostname==='api.firecrawl.dev' && url.pathname==='/v2/scrape'){
    if(body?.alexandria){
     const a=body.alexandria,o=a.options||{};
     if(Object.keys(body).some(k=>k!=='alexandria')||Object.keys(a).some(k=>!['provider','capability','options'].includes(k)))throw new Error('Unbudgeted Alexandria options.');
     if(a.provider==='firecrawl'&&a.capability==='find-tools'){kind='firecrawl-discovery';}
     else if((a.provider==='shopify'&&a.capability==='catalog/search_catalog'&&Number.isInteger(o.limit)&&o.limit>=1&&o.limit<=6)||(a.provider==='nike-com'&&a.capability==='products/search'&&o.count===24)){
      if(Object.keys(o).some(k=>!['query','country','limit','count'].includes(k))||typeof o.query!=='string')throw new Error('Unbudgeted Alexandria options.');
      amount=.05;kind='firecrawl';
     }else throw new Error('Check Alexandria contract and pricing before executing this tool.');
    }else{
     const allowed=['url','formats','parsers','onlyMainContent','timeout','proxy','skipTlsVerification'];
     if(!body||Object.keys(body).some(k=>!allowed.includes(k))||JSON.stringify(body.formats)!=='["markdown"]'||JSON.stringify(body.parsers)!=='[]'||!['basic','enhanced'].includes(body.proxy)||!(body.timeout>=1000&&body.timeout<=30000))throw new Error('Firecrawl evaluation allows only bounded markdown scrapes.');
     amount=.05;kind='firecrawl';
    }
   }else if(url.hostname==='api.apify.com' && /\/runs$/.test(url.pathname)){
    amount=Number(url.searchParams.get('maxTotalChargeUsd'));kind='apify';
    if(!(amount>0 && amount<=.60))throw new Error('Apify run needs a charge cap at most $0.60.');
   }else throw new Error('Evaluation blocks unbudgeted network mutations.');
  }
  const id=cacheKey(url.href,body),path=join(dir,'cache',id+'.json');
  const polling=url.hostname==='api.apify.com' && url.pathname.includes('/actor-runs/');
  if(existsSync(path)){
   const saved=JSON.parse(readFileSync(path,'utf8'));
   return new Response(JSON.stringify(saved.body),{status:saved.status,headers:{'Content-Type':'application/json'}});
  }
  if(!live)throw new Error('Cache miss: use --live to authorize paid evaluation calls.');
  if(amount){
   const ledger=readLedger();
   if(ledger.entries.some(e=>e.id===id))throw new Error('Uncertain or pending paid request; reconcile ledger before retrying.');
   ledger.reserve(id,amount,phase);saveJson(ledgerPath,ledger.snapshot());
  }
  const started=Date.now();
  const response=await fetchImpl(url.href,{...init,...(body?{body:JSON.stringify(body)}:{}),redirect:'error'});
  const data=await response.json();
  const terminal=['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(data?.data?.status);
  if(!polling||terminal)saveJson(path,redact({url:url.href,kind,status:response.status,elapsedMs:Date.now()-started,body:data},secrets));
  if(kind==='apify' && data?.data?.id){const ledger=readLedger();ledger.entries.find(e=>e.id===id).externalRunId=data.data.id;saveJson(ledgerPath,ledger.snapshot());}
  if(polling && terminal && Number.isFinite(data.data.usageTotalUsd)){const ledger=readLedger();const entry=ledger.entries.find(e=>e.externalRunId===data.data.id && e.status==='pending');if(entry){try{ledger.settle(entry.id,data.data.usageTotalUsd);}finally{saveJson(ledgerPath,ledger.snapshot());}}}
  if(amount && kind!=='apify'){
   const billed=data?.cheaper_inference?.billing?.billed_cost_usd ?? data?.usage?.cost;
   const credits=kind==='firecrawl'?(data?.data?.creditsCost??data?.creditsUsed??(data?.data?.markdown!==undefined&&body?.proxy==='basic'?1:undefined)):undefined;
   const actual=kind==='firecrawl'?(Number.isFinite(credits)?credits*.005:undefined):['serper','serpapi'].includes(kind)?amount:billed!==undefined?Number(billed):undefined;
   if(actual!==undefined && Number.isFinite(actual) && actual>=0){
    const ledger=readLedger();
    if(kind==='firecrawl')Object.assign(ledger.entries.find(e=>e.id===id),{credits,estimatedUsdPerCredit:.005});
    try {ledger.settle(id,actual);} finally {saveJson(ledgerPath,ledger.snapshot());}
   }
  }
  return new Response(JSON.stringify(data),{status:response.status,headers:{'Content-Type':'application/json'}});
 };
 let visionTail=Promise.resolve();
 return (input,init={})=>{
  if(new URL(String(input)).hostname!=='api.cheaperinference.com')return request(input,init);
  const result=visionTail.then(()=>request(input,init));
  visionTail=result.then(()=>undefined,()=>undefined);
  return result;
 };
}
