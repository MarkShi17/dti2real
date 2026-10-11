import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { evaluationEnv } from './env.mjs';
import { guardedFetch, saveJson } from './transport.mjs';
if(!process.argv.includes('--live'))throw new Error('Firecrawl probes require --live.');
const env=evaluationEnv();
if(!env.FIRECRAWL_API_KEY)throw new Error('Missing ACCURACY_FIRECRAWL_API_KEY in .env.accuracy.');
const headers={Authorization:'Bearer '+env.FIRECRAWL_API_KEY,'Content-Type':'application/json'};
const guarded=guardedFetch({live:process.argv.includes('--live'),phase:'pilot',secrets:[env.FIRECRAWL_API_KEY]});
const dir='.accuracy/firecrawl';mkdirSync(dir,{recursive:true});
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const pool=Object.values(read('.accuracy/shopping-all/fit1.json').rankings).flat();
const targets=['depop','grailed'].map(source=>({source,url:pool.find(p=>p.retrievalProvider==='apify:'+source)?.productUrl}));
targets.push({source:'ebay',url:read('.accuracy/pilot/0-ebay.json').data[0]?.url});
targets.push({source:'facebook',url:'https://www.facebook.com/marketplace/sanfrancisco/search/?query=black%20platform%20Mary%20Jane%20shoes'});
async function credits(){
 const r=await fetch('https://api.firecrawl.dev/v2/team/credit-usage',{headers,signal:AbortSignal.timeout(30000),redirect:'error'});
 const d=await r.json();return {status:r.status,remaining:d.data?.remainingCredits};
}
const before=await credits();
for(const target of targets){
 const path=dir+'/'+target.source+'.json';
 if(existsSync(path))continue;
 if(!target.url)throw new Error('No observed public URL for '+target.source);
 const start=Date.now();
 const body={url:target.url,formats:['markdown'],parsers:[],onlyMainContent:true,timeout:30000,proxy:'basic',skipTlsVerification:false};
 try{
  const r=await guarded('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  const data=await r.json(),md=data.data?.markdown||'',meta=data.data?.metadata||{};
  const report={...target,apiStatus:r.status,pageStatus:meta.statusCode,success:data.success,title:meta.title,description:meta.description,markdownCharacters:md.length,priceTokens:(md.match(/\$\s*\d+(?:[.,]\d+)?/g)||[]).slice(0,10),mentionsSold:/sold out|item sold|listing.*sold/i.test(md),elapsedMs:Date.now()-start,error:data.error||meta.error,warning:data.data?.warning};
  saveJson(path,report);console.log(JSON.stringify(report));
 }catch(e){saveJson(path,{...target,error:e.message,elapsedMs:Date.now()-start});console.log(target.source+': '+e.message);}
}
const after=await credits();
const creditPath=dir+'/credits.json';
if(!existsSync(creditPath))saveJson(creditPath,{before,after,observedCreditDelta:typeof before.remaining==='number'&&typeof after.remaining==='number'?before.remaining-after.remaining:null,note:'Account-wide snapshot; concurrent unrelated use could affect the delta. Ledger reserves $0.05/request and accounts reported credits at a conservative $0.005/credit; not invoice cost.'});
