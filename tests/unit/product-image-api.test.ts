import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/products/[id]/image/route';
import { storage } from '@/lib/storage';
import { COOKIE } from '@/lib/api';
import { fetchImage } from '@/lib/security';
vi.mock('@/lib/security',async original=>({...await original<typeof import('@/lib/security')>(),fetchImage:vi.fn()}));
let root:string,sid:string;
const context={params:Promise.resolve({id:'selected-top'})};
function request(session=sid){return new NextRequest('http://localhost:3212/api/products/selected-top/image',{headers:session?{Cookie:`${COOKIE}=${session}`}:{}});}
beforeEach(async()=>{
 root=await mkdtemp(join(tmpdir(),'dti-product-'));vi.stubEnv('DATA_DIR',root);vi.stubEnv('PUBLIC_ORIGIN','');sid=await storage.create();vi.mocked(fetchImage).mockReset();
 await storage.update(sid,d=>{d.products['selected-top']={id:'selected-top',garmentId:'top',source:'retailer',title:'White tank top',productUrl:'https://example.com/top',imageUrl:'https://images.gstatic.com/tank.webp',condition:'new',thrift:false,isDemo:false};});
});
afterEach(async()=>{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});
it('rejects another session before downloading the product image',async()=>{
 const other=await storage.create();expect((await GET(request(other),context)).status).toBe(404);expect(fetchImage).not.toHaveBeenCalled();
});
it('requires an existing session for image texture access',async()=>{expect((await GET(request(''),context)).status).toBe(401);expect(fetchImage).not.toHaveBeenCalled();});
it('normalizes and privately caches only the stored product URL',async()=>{
 vi.mocked(fetchImage).mockResolvedValue(await sharp({create:{width:2000,height:2000,channels:3,background:'#ee1133'}}).png().toBuffer());
 const response=await GET(request(),context);expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
 const bytes=Buffer.from(await response.arrayBuffer());expect((await sharp(bytes).metadata()).format).toBe('webp');expect((await sharp(bytes).metadata()).width).toBeLessThanOrEqual(1024);
 expect((await GET(request(),context)).status).toBe(200);expect(fetchImage).toHaveBeenCalledExactlyOnceWith('https://images.gstatic.com/tank.webp');
});
it('rejects prototype names and does not accept a client URL',async()=>{
 const response=await GET(request(),{params:Promise.resolve({id:'__proto__'})});expect(response.status).toBe(404);expect(fetchImage).not.toHaveBeenCalled();
});
