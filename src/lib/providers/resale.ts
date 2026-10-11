import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Filters, Garment, ProductListing } from '../schema';
import { AppError, safeExternalUrl } from '../security';
import { generateQueries } from '../ranking';
import { providerJson } from './http';
import type { ShoppingProvider } from './types';
const sources=['serpapi','ebay','serper','depop','grailed','ebay_scraper','serpapi_ebay'] as const;
export type ShoppingSource=typeof sources[number];
export type ResaleSource='depop'|'grailed'|'ebay_scraper';
export function selectedShoppingSources(): ShoppingSource[] {
 const explicit=process.env.SHOPPING_PROVIDERS;
 if(explicit!==undefined){
  const selected=[...new Set(explicit.split(',').map(s=>s.trim()).filter(Boolean))];
  if(selected.some(s=>!sources.includes(s as ShoppingSource)))throw new AppError('Unknown SHOPPING_PROVIDERS source.',503);
  return selected as ShoppingSource[];
 }
 return [...(process.env.SERPAPI_KEY?['serpapi' as const]:[]),...(process.env.EBAY_CLIENT_ID&&process.env.EBAY_CLIENT_SECRET?['ebay' as const]:[])];
}
export function shoppingSourceReady(source:ShoppingSource):boolean{
 return (source==='serpapi'||source==='serpapi_ebay')?!!process.env.SERPAPI_KEY:source==='serper'?!!process.env.SERPER_API_KEY:source==='ebay'?!!process.env.EBAY_CLIENT_ID&&!!process.env.EBAY_CLIENT_SECRET:!!process.env.APIFY_TOKEN;
}
const id=(g:Garment,url:string)=>createHash('sha256').update(g.id+'|'+url).digest('hex').slice(0,32);
const record=z.record(z.unknown());
const str=(v:unknown)=>typeof v==='string'?v:undefined;
function money(value:unknown):number|undefined{
 const n=typeof value==='number'?value:typeof value==='string'&&/^(?:US\s*)?\$?[\d,]+(?:\.\d{1,2})?$/.test(value.trim())?Number(value.replace(/[^\d.]/g,'')):NaN;
 return Number.isFinite(n)&&n>=0?n:undefined;
}
export function parseSerperResults(raw:unknown,g:Garment):ProductListing[]{
 const data=z.object({shopping:z.array(z.unknown())}).safeParse(raw);
 if(!data.success)throw new AppError('Serper returned a malformed shopping response.',502);
 return data.data.shopping.flatMap(item=>{
  const p=record.safeParse(item);if(!p.success)return[];
  const v=p.data,title=str(v.title),source=str(v.source),productUrl=safeExternalUrl(v.link),imageUrl=safeExternalUrl(v.imageUrl);
  if(!title||!source||!productUrl||!imageUrl)return[];
  const display=str(v.price)||'';
  return [{id:id(g,productUrl),garmentId:g.id,title,source,productUrl,imageUrl,price:money(v.price),currency:/^(US\s*)?\$/.test(display)?'USD':undefined,condition:'unknown' as const,thrift:false,isDemo:false,category:g.category,retrievedAt:new Date().toISOString(),retrievalProvider:'serper',availability:'unknown' as const}];
 });
}
const domains:Record<ResaleSource,string>={depop:'depop.com',grailed:'grailed.com',ebay_scraper:'ebay.com'};
export function parseResaleResults(raw:unknown,g:Garment,source:ResaleSource):ProductListing[]{
 if(!Array.isArray(raw))throw new AppError('Resale scraper returned malformed listings.',502);
 return raw.flatMap(item=>{
  const p=record.safeParse(item);if(!p.success)return[];
  const v=p.data,title=str(v.title)||str(v.itemName),productUrl=safeExternalUrl(v.url)||safeExternalUrl(v.itemUrl);
  const imageUrl=safeExternalUrl(v.imageUrl)||safeExternalUrl(v.image)||safeExternalUrl(v.mainPicture);
  if(!title||!productUrl||!imageUrl)return[];
  const host=new URL(productUrl).hostname;if(host!==domains[source]&&!host.endsWith('.'+domains[source]))return[];
  const condition=str(v.condition)||'',used=/used|pre.?owned|excellent|good|fair/i.test(condition),isNew=/new/i.test(condition);
  const currency=str(v.currency)||(/^(US\s*)?\$/.test(str(v.priceWithCurrency)||'')?'USD':undefined);
  const sold=v.sold===true||v.isSold===true||v.deleted===true;
  return [{id:id(g,productUrl),garmentId:g.id,title,source:source==='depop'?'Depop':source==='grailed'?'Grailed':'eBay',productUrl,imageUrl,price:money(v.priceAmount??v.price),currency,condition:used?'used' as const:isNew?'new' as const:'unknown' as const,thrift:used,isDemo:false,category:g.category,retrievedAt:str(v.scrapedAt)||new Date().toISOString(),retrievalProvider:'apify:'+source,availability:sold?'sold' as const:v.sold===false||v.isSold===false?'available' as const:'unknown' as const}];
 });
}
export class SerperShopping implements ShoppingProvider{
 async searchGarment(g:Garment,_filters:Filters){
  const responses=await Promise.all(generateQueries(g).slice(0,2).map(async q=>parseSerperResults(await providerJson('https://google.serper.dev/shopping',{method:'POST',headers:{'X-API-KEY':process.env.SERPER_API_KEY||'','Content-Type':'application/json'},body:JSON.stringify({q,gl:'us',hl:'en',num:6,page:1,autocorrect:true})},30000,0),g)));
  return responses.flatMap(items=>items.slice(0,6));
 }
}
const actors:Record<ResaleSource,string>={depop:'lukass~depop-scraper',grailed:'lulzasaur~grailed-scraper',ebay_scraper:'dtrungtin~ebay-items-scraper'};
export class ResaleShopping implements ShoppingProvider{
 constructor(private source:ResaleSource){}
 async searchGarment(g:Garment,_filters:Filters):Promise<ProductListing[]>{
  const q=generateQueries(g)[0],source=this.source,cap=source==='ebay_scraper'?.6:source==='grailed'?.1:.06;
  const input=source==='depop'?{search:[q],country:'us',sortBy:'relevance',maxItems:6,maxPagesPerSource:1,fetchDetails:false,proxy:{useApifyProxy:true,apifyProxyGroups:['RESIDENTIAL']}}:source==='grailed'?{searchQueries:[q],maxListings:6,scrapeDetails:false}:{startUrls:[{url:'https://www.ebay.com/sch/i.html?_nkw='+encodeURIComponent(q)}],maxItems:6,proxyConfig:{useApifyProxy:true,apifyProxyGroups:['RESIDENTIAL'],apifyProxyCountry:'US'}};
  const headers={Authorization:'Bearer '+process.env.APIFY_TOKEN,'Content-Type':'application/json'};
  const started=await providerJson('https://api.apify.com/v2/acts/'+actors[source]+'/runs?timeout=120&maxItems=6&maxTotalChargeUsd='+cap,{method:'POST',headers,body:JSON.stringify(input)},30000,0);
  const schema=z.object({data:z.object({id:z.string(),status:z.string(),defaultDatasetId:z.string().optional()})});
  let run=schema.parse(started).data;
  for(let i=0;i<70&&!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(run.status);i++){
   await new Promise(resolve=>setTimeout(resolve,2000));
   run=schema.parse(await providerJson('https://api.apify.com/v2/actor-runs/'+run.id,{headers})).data;
  }
  if(run.status!=='SUCCEEDED'||!run.defaultDatasetId)throw new AppError(source+' scraper did not finish successfully.',502);
  return parseResaleResults(await providerJson('https://api.apify.com/v2/datasets/'+run.defaultDatasetId+'/items?clean=true&limit=6',{headers}),g,source).slice(0,6);
 }
}

export function parseEbaySearchResults(raw:unknown,g:Garment):ProductListing[]{
 const data=z.object({organic_results:z.array(z.unknown())}).safeParse(raw);
 if(!data.success)throw new AppError('eBay search returned malformed listings.',502);
 return data.data.organic_results.flatMap(item=>{
  const parsed=record.safeParse(item);if(!parsed.success)return[];
  const v=parsed.data,title=str(v.title),productUrl=safeExternalUrl(v.link),imageUrl=safeExternalUrl(v.thumbnail);
  if(!title||!productUrl||!imageUrl)return[];
  const url=new URL(productUrl);
  if(!(url.hostname==='ebay.com'||url.hostname.endsWith('.ebay.com'))||!url.pathname.startsWith('/itm/'))return[];
  const single=z.object({extracted:z.number().nonnegative(),raw:z.string()}).safeParse(v.price);
  const condition=str(v.condition)||'',used=/pre.?owned|used/i.test(condition);
  return [{id:id(g,productUrl),garmentId:g.id,title,source:'eBay',productUrl,imageUrl,price:single.success?single.data.extracted:undefined,currency:single.success&&/^(US\s*)?\$/.test(single.data.raw)?'USD':undefined,condition:used?'used' as const:/new/i.test(condition)?'new' as const:'unknown' as const,thrift:used,isDemo:false,category:g.category,retrievedAt:new Date().toISOString(),retrievalProvider:'serpapi:ebay',availability:'unknown' as const}];
 });
}
export class SerpEbayShopping implements ShoppingProvider{
 async searchGarment(g:Garment,filters:Filters){
  const params=new URLSearchParams({engine:'ebay',_nkw:generateQueries(g)[0],ebay_domain:'ebay.com',_ipg:'25',_pgn:'1',api_key:process.env.SERPAPI_KEY||''});
  if(filters.secondhandOnly)params.set('LH_ItemCondition','3000');
  return parseEbaySearchResults(await providerJson('https://serpapi.com/search.json?'+params,{},45000,0),g).slice(0,12);
 }
}
