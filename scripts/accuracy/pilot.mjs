import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { evaluationEnv } from './env.mjs';
import { guardedFetch, saveJson } from './transport.mjs';
import { SpendLedger, cacheKey } from './core.mjs';
const env=evaluationEnv(),dir='.accuracy/pilot';
mkdirSync(dir,{recursive:true});
const guarded=guardedFetch({live:process.argv.includes('--live'),phase:'pilot',secrets:Object.values(env).filter(v=>v.length>20)});
const queries=['white floral lace corset top','pink rhinestone shoulder bag','black red puff sleeve gothic top','black furry leg warmers','brown gingham pinafore mini dress','black platform Mary Jane heels'];
const actors={
 depop:{actor:'lukass~depop-scraper',cap:.06,input:q=>({search:[q],country:'us',sortBy:'relevance',maxItems:6,maxPagesPerSource:1,fetchDetails:false,proxy:{useApifyProxy:true,apifyProxyGroups:['RESIDENTIAL']}})},
 grailed:{actor:'lulzasaur~grailed-scraper',cap:.1,input:q=>({searchQueries:[q],maxListings:6,scrapeDetails:false})},
 ebay:{actor:'dtrungtin~ebay-items-scraper',cap:.6,input:q=>({startUrls:[{url:'https://www.ebay.com/sch/i.html?_nkw='+encodeURIComponent(q)}],maxItems:6,proxyConfig:{useApifyProxy:true,apifyProxyGroups:['RESIDENTIAL'],apifyProxyCountry:'US'}})}
};
const auth={Authorization:'Bearer '+env.APIFY_TOKEN,'Content-Type':'application/json'};
async function run(source,q,index){
 const path=dir+'/'+index+'-'+source+'.json';
 if(existsSync(path))return;
 const start=Date.now();
 try{
  if(source==='serpapi'){
   const query=new URLSearchParams({engine:'google_shopping',q,api_key:env.SERPAPI_KEY,gl:'us',hl:'en'});
   const r=await guarded('https://serpapi.com/search.json?'+query,{signal:AbortSignal.timeout(30000)});
   const data=await r.json();saveJson(path,{q,source,status:r.status,elapsedMs:Date.now()-start,data});
   console.log(index,source,r.status,(data.shopping_results||[]).length);return;
  }
  if(source==='serper'){
   const r=await guarded('https://google.serper.dev/shopping',{method:'POST',headers:{'X-API-KEY':env.SERPER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({q,gl:'us',hl:'en',num:6,page:1,autocorrect:true})});
   const data=await r.json();saveJson(path,{q,source,status:r.status,elapsedMs:Date.now()-start,data});
   console.log(index,source,r.status,(data.shopping||[]).length);return;
  }
  const a=actors[source],body=a.input(q),url='https://api.apify.com/v2/acts/'+a.actor+'/runs?timeout=120&maxItems=6&maxTotalChargeUsd='+a.cap;
  const r=await guarded(url,{method:'POST',headers:auth,body:JSON.stringify(body)});
  const payload=await r.json();if(!r.ok)throw new Error('Apify HTTP '+r.status+': '+(payload.error?.message||''));
  let info=payload.data;
  for(let i=0;i<70&&!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(info.status);i++){
   await new Promise(resolve=>setTimeout(resolve,2000));
   const status=await fetch('https://api.apify.com/v2/actor-runs/'+info.id,{headers:auth,signal:AbortSignal.timeout(30000)});
   info=(await status.json()).data;
  }
  let data=[];
  if(info.defaultDatasetId){
   const rows=await fetch('https://api.apify.com/v2/datasets/'+info.defaultDatasetId+'/items?clean=true&limit=6',{headers:auth,signal:AbortSignal.timeout(30000)});
   if(rows.ok)data=await rows.json();
  }
  const ledger=new SpendLedger(JSON.parse(readFileSync('.accuracy/ledger.json','utf8')));
  const entry=ledger.entries.find(e=>e.id===cacheKey(url,body));
  if(entry?.status==='pending'&&Number.isFinite(info.usageTotalUsd)&&['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(info.status)){
   try{ledger.settle(entry.id,info.usageTotalUsd);}finally{saveJson('.accuracy/ledger.json',ledger.snapshot());}
  }
  saveJson(path,{q,source,elapsedMs:Date.now()-start,run:{id:info.id,status:info.status,usageTotalUsd:info.usageTotalUsd,chargedEventCounts:info.chargedEventCounts},data});
  console.log(index,source,info.status,data.length,'$'+info.usageTotalUsd);
 }catch(e){saveJson(path,{q,source,error:e.message,elapsedMs:Date.now()-start});console.log(index,source,e.message);}
}
for(let i=0;i<queries.length;i++){
 for(const source of ['serper','depop','grailed','ebay',...(env.SERPAPI_KEY?['serpapi']:[])])await run(source,queries[i],i);
}
