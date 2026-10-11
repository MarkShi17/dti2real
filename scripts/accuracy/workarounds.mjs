import { existsSync, mkdirSync } from 'node:fs';
import { evaluationEnv } from './env.mjs';
import { guardedFetch, saveJson } from './transport.mjs';
if(!process.argv.includes('--live'))throw new Error('Workaround probes require --live.');
const env=evaluationEnv(),dir='.accuracy/workarounds';mkdirSync(dir,{recursive:true});
const guarded=guardedFetch({live:true,phase:'pilot',secrets:[env.SERPAPI_KEY,env.FIRECRAWL_API_KEY]});
const query='white fitted camisole top';
const ebay=dir+'/serpapi-ebay.json';
if(!existsSync(ebay)){
 const params=new URLSearchParams({engine:'ebay',_nkw:query,ebay_domain:'ebay.com',_ipg:'25',_pgn:'1',api_key:env.SERPAPI_KEY});
 const start=Date.now();
 try{
  const r=await guarded('https://serpapi.com/search.json?'+params,{signal:AbortSignal.timeout(60000)});
  const data=await r.json();saveJson(ebay,{query,status:r.status,elapsedMs:Date.now()-start,data});
  console.log(JSON.stringify({source:'serpapi:ebay',status:r.status,results:data.organic_results?.length,error:data.error}));
 }catch(e){saveJson(ebay,{query,error:e.message});}
}
for(const [source,url] of [
 ['depop','https://www.depop.com/search/?q='+encodeURIComponent(query)],
 ['ebay','https://www.ebay.com/sch/i.html?_nkw='+encodeURIComponent(query)]
]){
 const path=dir+'/firecrawl-'+source+'.json';if(existsSync(path))continue;
 const start=Date.now();
 try{
  const r=await guarded('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{Authorization:'Bearer '+env.FIRECRAWL_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({url,formats:['markdown'],parsers:[],onlyMainContent:true,timeout:30000,proxy:'enhanced',skipTlsVerification:false}),signal:AbortSignal.timeout(45000)});
  const data=await r.json();saveJson(path,{source,query,url,proxy:'enhanced',status:r.status,elapsedMs:Date.now()-start,data});
  console.log(JSON.stringify({source:'firecrawl:'+source,status:r.status,pageStatus:data.data?.metadata?.statusCode,characters:data.data?.markdown?.length,error:data.error}));
 }catch(e){saveJson(path,{source,query,error:e.message,elapsedMs:Date.now()-start});}
}
