import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEMO_GARMENTS } from '@/lib/fixtures';
import { defaultFilters } from '@/lib/schema';
const mocks=vi.hoisted(()=>({input:{} as Record<string,unknown>,products:{} as Record<string,unknown>,search:vi.fn(),verify:vi.fn(),getImage:vi.fn()}));
vi.mock('@/lib/api',()=>({session:async()=> 'session',body:async()=>mocks.input,json:(v:unknown)=>Response.json(v),apiError:(e:Error)=>Response.json({error:e.message},{status:500})}));
vi.mock('@/lib/providers/config',()=>({providerStatus:()=>({shopping:{mode:'live'},vision:{mode:'live'}})}));
vi.mock('@/lib/providers/shopping',()=>({liveSearch:mocks.search}));
vi.mock('@/lib/providers/matching',()=>({verifyProductMatches:mocks.verify}));
vi.mock('@/lib/storage',()=>({storage:{getImage:mocks.getImage,update:async(_id:string,fn:(d:unknown)=>void)=>fn({products:mocks.products})}}));
import { POST } from '@/app/api/search/route';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('STRICT_SHOPPING_MATCH','true');mocks.input={garment:DEMO_GARMENTS[0],filters:defaultFilters};mocks.products={};mocks.search.mockResolvedValue({products:[],warnings:[]});mocks.verify.mockResolvedValue({products:[],warnings:[]});});
afterEach(()=>vi.unstubAllEnvs());
it('does not spend on retrieval or show unchecked products without an original screenshot',async()=>{
 const r=await POST(new NextRequest('http://localhost/api/search',{method:'POST'}));
 const data=await r.json();expect(data.products).toEqual([]);expect(data.warnings.join(' ')).toMatch(/screenshot/i);expect(mocks.search).not.toHaveBeenCalled();
});
it('replaces prior garment listings when the screenshot check rejects them',async()=>{
 mocks.input.imageId='source';mocks.getImage.mockResolvedValue(Buffer.from('image'));
 mocks.products={old:{id:'old',garmentId:DEMO_GARMENTS[0].id},other:{id:'other',garmentId:'another'}};
 mocks.search.mockResolvedValue({products:[mocks.products.old],warnings:[]});
 const r=await POST(new NextRequest('http://localhost/api/search',{method:'POST'}));
 expect((await r.json()).products).toEqual([]);expect(mocks.products.old).toBeUndefined();expect(mocks.products.other).toBeDefined();
});

it('clears stale listings if the supplied screenshot is no longer available',async()=>{
 mocks.input.imageId='missing';mocks.getImage.mockRejectedValue(new Error('Not found'));
 mocks.products={old:{id:'old',garmentId:DEMO_GARMENTS[0].id}};
 const r=await POST(new NextRequest('http://localhost/api/search',{method:'POST'}));
 expect(r.status).toBe(200);
 const data=await r.json();expect(data.products).toEqual([]);expect(data.warnings.join(' ')).toMatch(/screenshot/i);
 expect(mocks.products.old).toBeUndefined();expect(mocks.search).not.toHaveBeenCalled();
});
