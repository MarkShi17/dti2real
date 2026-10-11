import { it, expect } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyProductMatches } from '@/lib/providers/matching';
import { parseEbaySearchResults } from '@/lib/providers/resale';
import { fetchImage } from '@/lib/security';
import { normalizeImage } from '@/lib/images';
import type { Garment, ProductListing } from '@/lib/schema';
import { guardedFetch, saveJson } from './transport.mjs';
import { probePools } from './probe-products.mjs';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
it('compares Alexandria and scraper listings directly with the original screenshot',async()=>{
 expect(process.env.ACCURACY_LIVE).toBe('true');
 const original=globalThis.fetch;
 globalThis.fetch=guardedFetch({live:true,phase:'probes',secrets:[process.env.VISION_API_KEY||'']});
 process.env.IMAGE_ALLOWED_HOSTS='cdn.shopify.com,static.nike.com,fbcdn.net';
 try{
  mkdirSync('.accuracy/probes',{recursive:true});mkdirSync('.accuracy/product-images',{recursive:true});
  const garments:Garment[]=read('.accuracy/retest/fit10.json').garments;
  const top=garments.find(g=>g.name==='White fitted camisole top')!,shoes=garments.find(g=>g.category==='shoes')!;
  const pools:{name:string;garment:Garment;products:ProductListing[]}[]=probePools(top,shoes);
  const ebay=read('.accuracy/workarounds/serpapi-ebay.json');
  pools.push({name:'serpapi-ebay',garment:top,products:ebay.data?.organic_results?parseEbaySearchResults(ebay.data,top).slice(0,12):[]});
  const screenshot=readFileSync('.accuracy/images/fit10.webp');
  for(const pool of pools){
   const path='.accuracy/probes/'+pool.name+'.json';if(existsSync(path))continue;
   const result=await verifyProductMatches(pool.products,pool.garment,screenshot);
   for(const p of pool.products){
    const dest='.accuracy/product-images/'+createHash('sha256').update(p.imageUrl).digest('hex')+'.webp';
    if(!existsSync(dest))try{writeFileSync(dest,(await normalizeImage(await fetchImage(p.imageUrl),600)).data);}catch{/* unavailable photos remain rejected */}
   }
   saveJson(path,{caseId:'fit10',garment:pool.garment,candidates:pool.products,...result});
   console.log(pool.name+': '+result.products.length+'/'+pool.products.length+' verified matches');
  }
  const raw=['Depop','Grailed','eBay','Facebook'].map(source=>{const r=read('.accuracy/raw/'+source+'.json');return {source,http:r.http?.status,browser:r.browser?.status,products:r.products.length};});
  const tls=['depop','grailed','ebay'].map(source=>{const r=read('.accuracy/raw-http/'+source+'.json');return {source,attempts:r.attempts,products:r.products.length};});
  const firecrawl=['depop','ebay'].map(source=>{const r=read('.accuracy/workarounds/firecrawl-'+source+'.json');return {source,status:r.status,pageStatus:r.data?.data?.metadata?.statusCode,characters:r.data?.data?.markdown?.length,error:r.error||r.data?.error};});
  saveJson('.accuracy/probes/summary.json',{caseId:'fit10',note:'Small user-directed diagnostic, not a held-out benchmark. All candidates compared with original outfit screenshot. Unavailable photos are rejected.',raw,tls,firecrawl,serpapiEbay:{status:ebay.status,results:ebay.data?.organic_results?.length,error:ebay.error||ebay.data?.error},alexandria:['shopify','nike-com'].map(source=>{const r=read('.accuracy/alexandria/'+source+'.json');return {source,status:r.status,credits:r.data?.data?.creditsCost};}),matches:pools.map(p=>{const r=read('.accuracy/probes/'+p.name+'.json');return {source:p.name,candidates:r.candidates.length,accepted:r.products.length,warnings:r.warnings};})});
 }finally{globalThis.fetch=original;}
});
