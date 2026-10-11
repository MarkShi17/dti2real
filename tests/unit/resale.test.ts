import { afterEach, it, expect, vi } from 'vitest';
import { parseResaleResults, parseSerperResults, selectedShoppingSources, ResaleShopping } from '@/lib/providers/resale';
import { providerStatus } from '@/lib/providers/config';
import { DEMO_GARMENTS } from '@/lib/fixtures';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('preserves real resale links, image provenance and sold status without inventing currency',()=>{
 const result=parseResaleResults([{title:'White lace corset',url:'https://www.grailed.com/listings/123',imageUrl:'https://media-assets.grailed.com/a',price:43,condition:'Used',sold:true}],DEMO_GARMENTS[0],'grailed');
 expect(result).toHaveLength(1);
 expect(result[0]).toMatchObject({source:'Grailed',retrievalProvider:'apify:grailed',availability:'sold',condition:'used',price:43,isDemo:false});
 expect(result[0].currency).toBeUndefined();
 expect(()=>parseResaleResults({error:'bad'},DEMO_GARMENTS[0],'grailed')).toThrow();
});
it('rejects missing images and off-marketplace or unsafe resale URLs',()=>{
 expect(parseResaleResults([
 {title:'fake',url:'https://evil.example/item',imageUrl:'https://images.example/item'},
 {title:'missing image',url:'https://www.grailed.com/listings/3'},
 {title:'unsafe',url:'http://localhost/a',imageUrl:'https://images.example/item'}
 ],DEMO_GARMENTS[0],'grailed')).toEqual([]);
});
it('normalizes Google Shopping results with explicit currency only',()=>{
 const p=parseSerperResults({shopping:[{title:'White lace corset',source:'Retailer',link:'https://shop.example/product',imageUrl:'https://images.example/a',price:'$25.50'},{title:'Unsafe',link:'http://localhost/a',imageUrl:'https://images.example/a'}]},DEMO_GARMENTS[0]);
 expect(p).toHaveLength(1);expect(p[0]).toMatchObject({price:25.5,currency:'USD',retrievalProvider:'serper',source:'Retailer'});
 expect(()=>parseSerperResults({message:'Unauthorized'},DEMO_GARMENTS[0])).toThrow();
});
it('requires explicit source selection for paid scrapers and reports missing credentials as unavailable',()=>{
 vi.stubEnv('DEMO_MODE','false');vi.stubEnv('SHOPPING_PROVIDERS','grailed');vi.stubEnv('APIFY_TOKEN','');
 vi.stubEnv('SERPER_API_KEY','present');
 expect(selectedShoppingSources()).toEqual(['grailed']);
 expect(providerStatus().shopping.mode).toBe('unavailable');
 vi.stubEnv('APIFY_TOKEN','present');expect(providerStatus().shopping.mode).toBe('live');
 vi.stubEnv('SHOPPING_PROVIDERS','typo');expect(()=>selectedShoppingSources()).toThrow(/unknown/i);
});

it('uses the residential proxy required by Depop before returning real listings',async()=>{
 vi.stubEnv('APIFY_TOKEN','test');
 vi.stubGlobal('fetch',async (url:string,init:RequestInit)=>{
  if(init.method==='POST'){
   const input=JSON.parse(String(init.body));
   if(!input.proxy?.apifyProxyGroups?.includes('RESIDENTIAL')) return Response.json({error:'datacenter blocked'},{status:403});
   return Response.json({data:{id:'run',status:'SUCCEEDED',defaultDatasetId:'dataset'}});
  }
  return Response.json([{itemName:'White corset',itemUrl:'https://www.depop.com/products/123/',mainPicture:'https://media-photos.depop.com/123.jpg',priceAmount:25,currency:'USD',isSold:false}]);
 });
 const products=await new ResaleShopping('depop').searchGarment(DEMO_GARMENTS[0],{marketplaces:[],secondhandOnly:false,sortBy:'best_match'});
 expect(products[0]).toMatchObject({source:'Depop',price:25,currency:'USD',availability:'available'});
});

it('parses dedicated eBay search with direct links and explicit single prices', async()=>{
 const {parseEbaySearchResults}=await import('@/lib/providers/resale');
 const items=parseEbaySearchResults({organic_results:[
  {title:'White fitted camisole',link:'https://www.ebay.com/itm/123456789012?x=1',thumbnail:'https://i.ebayimg.com/a.jpg',price:{raw:'$15.00',extracted:15},condition:'Pre-Owned'},
  {title:'Range',link:'https://www.ebay.com/itm/123456789013',thumbnail:'https://i.ebayimg.com/b.jpg',price:{from:{raw:'$5',extracted:5},to:{raw:'$30',extracted:30}}},
  {title:'Wrong domain',link:'https://ebay.com.evil.test/itm/1',thumbnail:'https://i.ebayimg.com/c.jpg'}
 ]},DEMO_GARMENTS[0]);
 expect(items).toHaveLength(2);
 expect(items[0]).toMatchObject({source:'eBay',retrievalProvider:'serpapi:ebay',price:15,currency:'USD',condition:'used',thrift:true});
 expect(items[1].price).toBeUndefined();
 expect(()=>parseEbaySearchResults({error:'Unauthorized'},DEMO_GARMENTS[0])).toThrow();
});
it('uses existing SerpApi credentials for bounded direct eBay searches',async()=>{
 const {SerpEbayShopping}=await import('@/lib/providers/resale');
 vi.stubEnv('SHOPPING_PROVIDERS','serpapi_ebay');vi.stubEnv('SERPAPI_KEY','test');vi.stubEnv('DEMO_MODE','false');
 expect(providerStatus().shopping.mode).toBe('live');
 vi.stubGlobal('fetch',async(url:string)=>{
  const q=new URL(url).searchParams;
  expect(q.get('engine')).toBe('ebay');expect(q.get('_ipg')).toBe('25');expect(q.get('_nkw')).toBeTruthy();
  expect(q.get('LH_ItemCondition')).toBe('3000');
  return Response.json({organic_results:[]});
 });
 expect(await new SerpEbayShopping().searchGarment(DEMO_GARMENTS[0],{marketplaces:[],secondhandOnly:true,sortBy:'best_match'})).toEqual([]);
});
