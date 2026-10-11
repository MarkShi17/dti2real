import { chromium } from '@playwright/test';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { saveJson } from './transport.mjs';
if(!process.argv.includes('--live'))throw new Error('Raw web probes require --live.');
const dir='.accuracy/raw';mkdirSync(dir,{recursive:true});
const query='white fitted camisole top';
const targets=[
 {source:'Depop',host:'depop.com',url:'https://www.depop.com/search/?q='+encodeURIComponent(query),pattern:'/products/'},
 {source:'Grailed',host:'grailed.com',url:'https://www.grailed.com/shop?query='+encodeURIComponent(query),pattern:'/listings/'},
 {source:'eBay',host:'ebay.com',url:'https://www.ebay.com/sch/i.html?_nkw='+encodeURIComponent(query),pattern:'/itm/'},
 {source:'Facebook',host:'facebook.com',url:'https://www.facebook.com/marketplace/sanfrancisco/search/?query='+encodeURIComponent(query),pattern:'/marketplace/item/'}
];
const garment=JSON.parse(readFileSync('.accuracy/retest/fit10.json','utf8')).garments.find(g=>g.name==='White fitted camisole top');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const target of targets){
  const path=dir+'/'+target.source+'.json';if(existsSync(path))continue;
  const start=Date.now(),context=await browser.newContext(),page=await context.newPage();
  const result={source:target.source,query,caseId:'fit10',garmentId:garment.id,searchUrl:target.url,method:'Direct HTTP + isolated Playwright DOM; no scraping API or login',products:[]};
  try{
   try{const r=await fetch(target.url,{signal:AbortSignal.timeout(20000),redirect:'follow'});const html=await r.text();result.http={status:r.status,htmlCharacters:html.length,hasJsonLd:/application\/ld\+json/i.test(html),title:html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]};}
   catch(e){result.http={error:e.message};}
   const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1500);
   result.browser={status:response?.status(),title:await page.title(),finalUrl:page.url()};
   const links=await page.locator('a[href]').evaluateAll((links,pattern)=>[...new Set(links.map(a=>a.href).filter(h=>h.includes(pattern)))].slice(0,6),target.pattern);
   result.discovered=links.length;
   for(const url of links.slice(0,2)){
    const parsed=new URL(url);if(parsed.protocol!=='https:'||!(parsed.hostname===target.host||parsed.hostname.endsWith('.'+target.host)))continue;
    try{
     await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});await page.waitForTimeout(1000);
     const item=await page.evaluate(()=>{
      const meta=n=>document.querySelector('meta[property="'+n+'"],meta[name="'+n+'"]')?.getAttribute('content');
      const all=[];
      const collect=o=>{if(Array.isArray(o))o.forEach(collect);else if(o&&typeof o==='object'){if(o['@type']==='Product'||o['@type']?.includes?.('Product'))all.push(o);if(o['@graph'])collect(o['@graph']);}};
      for(const script of document.querySelectorAll('script[type="application/ld+json"]')){try{collect(JSON.parse(script.textContent||''));}catch{}}
      const p=all[0],offer=Array.isArray(p?.offers)?p.offers[0]:p?.offers,img=Array.isArray(p?.image)?p.image[0]:p?.image;
      return {title:p?.name||meta('og:title'),imageUrl:typeof img==='string'?img:img?.url||meta('og:image'),price:offer?.price,currency:offer?.priceCurrency,description:p?.description||meta('og:description')};
     });
     if(item.title&&item.imageUrl&&new URL(item.imageUrl).protocol==='https:')result.products.push({id:createHash('sha256').update(url).digest('hex').slice(0,32),garmentId:garment.id,title:item.title,source:target.source,productUrl:url,imageUrl:item.imageUrl,price:Number.isFinite(Number(item.price))?Number(item.price):undefined,currency:item.currency,condition:'unknown',thrift:false,isDemo:false,retrievalProvider:'raw:'+target.source.toLowerCase()});
    }catch(e){result.pageErrors??=[];result.pageErrors.push(e.message);}
   }
  }catch(e){result.error=e.message;}
  finally{result.elapsedMs=Date.now()-start;saveJson(path,result);console.log(JSON.stringify({source:target.source,http:result.http?.status,browser:result.browser?.status,discovered:result.discovered,products:result.products.length,error:result.error}));await context.close();}
 }
}finally{await browser.close();}
