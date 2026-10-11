import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/segment/route';
import { storage } from '@/lib/storage';
import { COOKIE } from '@/lib/api';
import { DEMO_GARMENTS } from '@/lib/fixtures';
let root:string, id:string, screenshotId:string;
beforeEach(async()=>{
 root=await mkdtemp(join(tmpdir(),'dti-segment-api-'));vi.stubEnv('DATA_DIR',root);vi.stubEnv('PUBLIC_ORIGIN','');
 id=await storage.create();
 const png=await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer();
 screenshotId=(await storage.putImage(id,png,'screenshot')).id;
});
afterEach(async()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();await rm(root,{recursive:true,force:true});});
function request(session=id,imageId=screenshotId,origin='http://localhost:3212') {
 return new NextRequest('http://localhost:3212/api/segment',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:`${COOKIE}=${session}`},body:JSON.stringify({imageId,garments:[DEMO_GARMENTS[0]]})});
}
describe('mask route isolation',()=>{
 it('rejects a screenshot belonging to another session before invoking a model',async()=>{
  const other=await storage.create();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect((await POST(request(other))).status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
 });
 it('rejects cross-origin mutations',async()=>expect((await POST(request(id,screenshotId,'https://outside.example'))).status).toBe(403));
 it('does not report a generation when the worker is not configured',async()=>{
  vi.stubEnv('DEMO_MODE','false');vi.stubEnv('SEGMENTATION_URL','');
  const response=await POST(request());expect(response.status).toBe(503);expect((await response.json()).error).toContain('configured SAM worker');
 });
 it('rejects malformed garment prompts without invoking a model',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const req=new NextRequest('http://localhost:3212/api/segment',{method:'POST',headers:{'Content-Type':'application/json',Cookie:`${COOKIE}=${id}`},body:JSON.stringify({imageId:screenshotId,garments:[{id:'bad',bbox:{x:'bad'}}]})});
  expect((await POST(req)).status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
 });
});
