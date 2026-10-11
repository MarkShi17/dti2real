import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { verifyProductMatches } from '@/lib/providers/matching';
import { providerJson } from '@/lib/providers/http';
import { fetchImage } from '@/lib/security';
import { DEMO_GARMENTS } from '@/lib/fixtures';
import type { ProductListing } from '@/lib/schema';
vi.mock('@/lib/providers/http',()=>({providerJson:vi.fn()}));
vi.mock('@/lib/security',async original=>({...await original<object>(),fetchImage:vi.fn()}));
const product=(i:number):ProductListing=>({id:String(i),garmentId:'g',title:'White fitted camisole top',source:'Depop',productUrl:'https://www.depop.com/products/'+i,imageUrl:'https://media-photos.depop.com/'+i+'.jpg',condition:'unknown',thrift:false,isDemo:false});
const verdict=(id:string,change={})=>({id,category:'match',palette:'match',silhouette:'match',details:'match',score:80,reason:'Solid white, fitted body and narrow straps match.',...change});
const response=(matches:unknown[])=>({choices:[{message:{content:JSON.stringify({matches})}}]});
let screenshot:Buffer;
beforeEach(async()=>{screenshot=await sharp({create:{width:64,height:64,channels:3,background:'#fff'}}).png().toBuffer();vi.resetAllMocks();vi.mocked(fetchImage).mockResolvedValue(await sharp({create:{width:64,height:64,channels:3,background:'#fff'}}).png().toBuffer());});
it('rejects colored accents and uncertain color even when their ranking scores are high',async()=>{
 vi.mocked(providerJson).mockResolvedValue(response([verdict('0',{score:50}),verdict('1',{palette:'mismatch',score:99}),verdict('2',{palette:'uncertain',score:98})]));
 const out=await verifyProductMatches([0,1,2].map(product),{...DEMO_GARMENTS[0],attributes:{color:['white'],silhouette:'fitted camisole'}},screenshot);
 expect(out.products.map(p=>p.id)).toEqual(['0']);
 expect(out.products[0].matchReason).toContain('Solid white');
 expect(out.rejected).toBe(2);
 const body=JSON.parse(vi.mocked(providerJson).mock.calls[0][1]!.body as string);
 expect(JSON.stringify(body)).toMatch(/small white logo|small white detail/);
});
it('checks every candidate and never appends an unchecked tail',async()=>{
 vi.mocked(providerJson).mockImplementation(async(_url,init)=>{
  const body=JSON.parse(init!.body as string),ids=body.response_format.json_schema.schema.properties.matches.items.properties.id.enum as string[];
  return response(ids.map(id=>verdict(id,{palette:id==='11'?'match':'mismatch'})));
 });
 const out=await verifyProductMatches(Array.from({length:12},(_,i)=>product(i)),DEMO_GARMENTS[0],screenshot);
 expect(out.products.map(p=>p.id)).toEqual(['11']);
 expect(vi.mocked(providerJson)).toHaveBeenCalledTimes(2);
});
it('rejects the wrong shoe construction even if color and category match',async()=>{
 vi.mocked(providerJson).mockResolvedValue(response([verdict('0',{details:'mismatch',reason:'Wrong platform and heel shape.'})]));
 const out=await verifyProductMatches([product(0)],{...DEMO_GARMENTS[0],category:'shoes',name:'White platform Mary Jane heels'},screenshot);
 expect(out.products).toEqual([]);
 const body=JSON.stringify(vi.mocked(providerJson).mock.calls[0][1]);
 expect(body).toContain('heel');
 expect(body).toContain('toe');
 expect(body).toContain('strap');
});
it('fails closed on missing IDs and inaccessible photos',async()=>{
 vi.mocked(providerJson).mockResolvedValue(response([verdict('wrong')]));
 expect((await verifyProductMatches([product(0)],DEMO_GARMENTS[0],screenshot)).products).toEqual([]);
 vi.mocked(fetchImage).mockRejectedValue(new Error('Unavailable'));
 const out=await verifyProductMatches([product(0)],DEMO_GARMENTS[0],screenshot);
 expect(out.products).toEqual([]);
 expect(out.warnings.length).toBeGreaterThan(0);
});

it('requires the original screenshot before claiming a visual match',async()=>{
 const out=await verifyProductMatches([product(0)],DEMO_GARMENTS[0]);
 expect(out.products).toEqual([]);
 expect(out.warnings.join(' ')).toMatch(/screenshot/i);
 expect(providerJson).not.toHaveBeenCalled();
});

it('rejects miniature doll shoes even when the visual model sees matching construction',async()=>{
 vi.mocked(providerJson).mockResolvedValue(response([verdict('0')]));
 const out=await verifyProductMatches([{...product(0),title:'BJD Doll Shoes 1/4 Scale Dolls Red Mary Janes'}],DEMO_GARMENTS[0],screenshot);
 expect(out.products).toEqual([]);
 expect(out.decisions[0].category).toBe('mismatch');
});
