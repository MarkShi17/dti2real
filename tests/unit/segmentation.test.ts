import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { DEMO_GARMENTS } from '@/lib/fixtures';
import { storage } from '@/lib/storage';
import { segmentGarments, segmentationStatus } from '@/lib/providers/segmentation';
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
 const root = await mkdtemp(join(tmpdir(), 'dti-segment-')); roots.push(root); vi.stubEnv('DATA_DIR', root);
 vi.stubEnv('DEMO_MODE', 'false'); vi.stubEnv('SEGMENTATION_URL', 'http://segment-worker:8000'); vi.stubEnv('SEGMENTATION_TOKEN', 'unit-test-token');
 const session = await storage.create();
 const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#aaff33' } }).webp().toBuffer();
 const screenshot = await storage.putImage(session, image, 'screenshot');
 const garment = { ...DEMO_GARMENTS[0], bbox: { x: .2, y: .2, w: .5, h: .6 } };
 const pixels = Buffer.alloc(10000); for(let y=20;y<80;y++) for(let x=20;x<70;x++) if(x>25 || y>35) pixels[y*100+x] = 255;
 const mask = await sharp(pixels, { raw: { width:100, height:100, channels:1 } }).png().toBuffer();
 const result = { model:'sam2.1-hiera-small', segments: [{ id:garment.id, mask:`data:image/png;base64,${mask.toString('base64')}`, score:.9 }] };
 return {session, image, screenshot, garment, result};
}
describe('real mask boundary', () => {
 it('requires a worker token and honors explicit demo mode', () => {
  vi.stubEnv('DEMO_MODE','false'); vi.stubEnv('SEGMENTATION_URL','http://worker:8000'); vi.stubEnv('SEGMENTATION_TOKEN','');
  expect(segmentationStatus().mode).toBe('unavailable');
  vi.stubEnv('SEGMENTATION_TOKEN','configured'); expect(segmentationStatus().mode).toBe('live');
  vi.stubEnv('DEMO_MODE','true'); expect(segmentationStatus().mode).toBe('demo');
 });
 it('stores an actual transparent cutout privately and preserves source binding', async () => {
  const f=await fixture(); vi.stubGlobal('fetch',vi.fn(async()=>Response.json(f.result)));
  const result=await segmentGarments(f.session,f.screenshot.id,f.image,[f.garment]);
  const segment=result.garments[0].segmentation!;
  expect(segment.sourceImageId).toBe(f.screenshot.id); expect(segment.score).toBe(.9);
  const image=await storage.getImage(f.session,segment.imageId);
  const raw=await sharp(image).ensureAlpha().raw().toBuffer();
  expect(raw[3]).toBe(0); expect(raw[(50*100+50)*4+3]).toBe(255);
  expect(raw[(25*100+22)*4+3]).toBe(0); // Real non-rectangular mask, not a bbox-shaped cutout.
  const other=await storage.create(); await expect(storage.getImage(other,segment.imageId)).rejects.toThrow();
 });
 it('leaves boxes usable on worker failure and says masks failed', async () => {
  const f=await fixture(); vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
  const result=await segmentGarments(f.session,f.screenshot.id,f.image,[f.garment]);
  expect(result.garments[0].segmentation).toBeUndefined(); expect(result.note).toMatch(/unavailable/i);
 });
 it('rejects mismatched mask dimensions without saving misleading segmentation', async () => {
  const f=await fixture(); const small=await sharp({create:{width:64,height:64,channels:3,background:'#fff'}}).greyscale().png().toBuffer();
  f.result.segments[0].mask=`data:image/png;base64,${small.toString('base64')}`;
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(f.result)));
  const result=await segmentGarments(f.session,f.screenshot.id,f.image,[f.garment]);
  expect(result.garments[0].segmentation).toBeUndefined(); expect(result.note).toMatch(/unavailable/i);
 });
 it('does not promote low-confidence masks or unrequested garment IDs', async () => {
  const f=await fixture(); f.result.segments[0].score=.2;
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(f.result)));
  expect((await segmentGarments(f.session,f.screenshot.id,f.image,[f.garment])).garments[0].segmentation).toBeUndefined();
  f.result.segments[0].score=.9; f.result.segments[0].id='unrequested';
  expect((await segmentGarments(f.session,f.screenshot.id,f.image,[f.garment])).garments[0].segmentation).toBeUndefined();
 });
 it('does not call the worker when segmentation is disabled', async () => {
  const f=await fixture(); vi.stubEnv('SEGMENTATION_URL',''); const fetcher=vi.fn(); vi.stubGlobal('fetch',fetcher);
  const result=await segmentGarments(f.session,f.screenshot.id,f.image,[f.garment]);
  expect(result.garments).toEqual([f.garment]); expect(fetcher).not.toHaveBeenCalled(); expect(result.note).toMatch(/boxes/i);
 });
});

it('keeps jewelry as manual regions even when a worker could confidently mask nearby skin', async()=>{
 const f=await fixture();const jewelry={...f.garment,category:'jewelry' as const};
 const fetcher=vi.fn(async()=>Response.json(f.result));vi.stubGlobal('fetch',fetcher);
 const result=await segmentGarments(f.session,f.screenshot.id,f.image,[jewelry]);
 expect(result.garments[0].segmentation).toBeUndefined();expect(fetcher).not.toHaveBeenCalled();
});
