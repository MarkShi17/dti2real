import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
export function probePools(top,shoes){
 const product=(raw,g,provider)=>{
  if(!raw.title||!raw.productUrl||!raw.imageUrl)return[];
  return [{...raw,id:createHash('sha256').update(g.id+'|'+raw.productUrl).digest('hex').slice(0,32),garmentId:g.id,category:g.category,condition:raw.condition||'unknown',availability:raw.availability||'unknown',thrift:false,isDemo:false,retrievalProvider:provider}];
 };
 const shop=read('.accuracy/alexandria/shopify.json').data.data.alexandria[0].data.products.flatMap(p=>{
  const v=p.variants?.[0];if(!v)return[];
  return product({title:v.title||p.title,source:v.seller?.name||'Shopify retailer',productUrl:v.url,imageUrl:(v.media||p.media||[]).find(m=>m.type==='image')?.url,price:v.price?.currency==='USD'?v.price.amount/100:undefined,currency:v.price?.currency,condition:'new',availability:v.availability?.available?'available':'unknown'},top,'alexandria:shopify');
 });
 const nike=read('.accuracy/alexandria/nike-com.json').data.data.alexandria[0].data.groups.flatMap(g=>g.variants||[]).slice(0,12).flatMap(v=>product({title:v.title+' · '+v.color,source:'Nike',productUrl:v.url,imageUrl:v.images?.portrait||v.images?.square,price:v.price?.current,currency:v.price?.currency,condition:'new'},shoes,'alexandria:nike'));
 const pools=[{name:'alexandria-shopify',garment:top,products:shop},{name:'alexandria-nike',garment:shoes,products:nike}];
 for(const name of ['depop','ebay','grailed']){
  const raw=read('.accuracy/raw-http/'+name+'.json');
  pools.push({name:'raw-'+name,garment:top,products:raw.products.flatMap(p=>product(p,top,'raw-http:'+name))});
 }
 const facebook=read('.accuracy/raw/Facebook.json');
 pools.push({name:'raw-facebook',garment:top,products:facebook.products.map(p=>({...p,garmentId:top.id}))});
 return pools;
}
