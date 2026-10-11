// Local GPU transport contracts use an explicit authenticated HTTP fixture.
// They verify app behavior, never photographic quality or real CUDA execution.
import { test, expect, ready, saved, waitJob } from './helpers';
import { readFile } from 'node:fs/promises';
import type { APIRequestContext, Page } from '@playwright/test';
const control = process.env.PLAYWRIGHT_GPU_CONTROL_URL!;
async function configure(request: APIRequestContext, settings: Record<string, string>) { expect((await request.post(`${control}/config`, { data: settings })).ok()).toBe(true); }
async function calls(request: APIRequestContext): Promise<{provider:string;category?:string;imageCount?:number;pose?:string;identityHash?:string}[]> { return (await request.get(`${control}/calls`)).json(); }
async function fitted(page: Page) {
  await ready(page); await page.getByLabel('Outfit screenshot file').setInputFiles('public/demo/sample.webp');
  await page.getByRole('button', { name: 'Analyze outfit', exact: true }).first().click();
  await expect(page.locator('.render-button')).toBeEnabled();
  await page.getByRole('button', { name: 'Your photo', exact: true }).click(); await page.getByRole('checkbox').last().check();
  await page.getByLabel('Person photo file').setInputFiles('public/demo/base-hip.webp');
  await expect(page.getByText('Your photo is selected')).toBeVisible();
  await page.locator('.render-button').click(); await expect(page.getByRole('button', { name: 'Save look', exact: true })).toBeEnabled();
  await saved(page, state => !!state.renderId);
}
test.beforeEach(async ({request,page})=>{ expect(control).toBeTruthy();expect((await request.post(`${control}/reset`,{data:{}})).ok()).toBe(true);const image=await(await request.get(`${control}/image`)).body();await page.route('https://dti2irl-fixtures.example.com/**',route=>route.fulfill({status:200,contentType:'image/webp',body:image})); });
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'});});

test('local worker readiness checks distinguish offline, incomplete models and missing CUDA', async({request})=>{
  for(const [gpu,message] of [['offline','offline'],['weights','downloading'],['no-cuda','CUDA']]) {
    await configure(request,{gpu});const status=await(await request.get('/api/status')).json();
    expect(status.tryon.mode).toBe('live');expect(status.tryon.ready).toBe(false);expect(status.tryon.detail).toContain(message);expect(status.pose.ready).toBe(false);
  }
  await configure(request,{gpu:'ready'});const status=await(await request.get('/api/status')).json();expect(status.tryon.ready).toBe(true);expect(status.pose.ready).toBe(true);
});

test('private photo composes two local garment calls and preserves its original pose',async({page,request})=>{
  await fitted(page);await expect(page.getByText('Your original photo pose',{exact:true})).toBeVisible();
  expect((await calls(request)).filter(c=>c.provider==='gpu-tryon').map(c=>c.category)).toEqual(['bottoms','tops']);
  const initial=await page.getByTestId('wardrobe-image').getAttribute('src');
  await page.getByRole('button',{name:'Peace sign',exact:true}).click();await expect(page.getByRole('button',{name:'Peace sign',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('wardrobe-image')).not.toHaveAttribute('src',initial!);
  expect((await calls(request)).filter(c=>c.provider==='gpu-pose')).toMatchObject([{imageCount:3,pose:'peace'}]);
});

test('private face uploads require consent and change pose identity references and cache keys',async({page,request})=>{
  await fitted(page);const file=await readFile('public/demo/base-runway.webp');
  expect((await page.request.post('/api/upload',{multipart:{kind:'face',file:{name:'face.webp',mimeType:'image/webp',buffer:file}}})).status()).toBe(400);
  const face=await(await page.request.post('/api/upload',{multipart:{kind:'face',consent:'true',file:{name:'face.webp',mimeType:'image/webp',buffer:file}}})).json();
  const session=await(await page.request.get('/api/session')).json(),base=session.renders[0];
  for(const faceId of [undefined,face.id]) {
    const response=await page.request.post('/api/pose',{data:{renderId:base.id,pose:'peace',faceId}});expect(response.ok()).toBe(true);
    expect((await waitJob(page.request,await response.json())).status).toBe('completed');
  }
  const records=(await calls(request)).filter(c=>c.provider==='gpu-pose');expect(records).toHaveLength(2);expect(records[0].identityHash).not.toBe(records[1].identityHash);
  const bad=await page.request.post('/api/pose',{data:{renderId:base.id,pose:'hip',faceId:'aaa1ba37-1b89-4e0d-9fbe-693883c501f0'}});expect(bad.status()).toBe(404);
});

test('worker inference failure keeps the previous private preview and permits same-pose retry',async({page,request})=>{
  await fitted(page);const prior=await page.getByTestId('wardrobe-image').getAttribute('src');
  await configure(request,{pose:'failed'});await page.getByRole('button',{name:'Peace sign',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByTestId('wardrobe-image')).toHaveAttribute('src',prior!);
  await configure(request,{pose:'ready'});await page.getByRole('button',{name:'Peace sign',exact:true}).click();await expect(page.getByRole('button',{name:'Peace sign',exact:true})).toHaveAttribute('aria-pressed','true');
  expect((await calls(request)).filter(c=>c.provider==='gpu-pose')).toHaveLength(2);
});

test('rapid 3D pose selection updates immediately and the latest photo request wins',async({page,request})=>{
  await fitted(page);await configure(request,{pose:'delayed'});
  await page.getByRole('button',{name:'3D avatar',exact:true}).click();
  await page.getByRole('button',{name:'Peace sign',exact:true}).click();
  await expect.poll(async()=> (await calls(request)).some(c=>c.provider==='gpu-pose'&&c.pose==='peace')).toBe(true);
  await page.getByRole('button',{name:'Hand on hip',exact:true}).click();await expect(page.getByTestId('avatar-stage')).toHaveAttribute('data-pose','hip');
  await saved(page,state=>!!state.renderId && state.avatarPose==='hip');
  await expect.poll(async()=>{const session=await(await page.request.get('/api/session')).json();return session.renders.find((r:{id:string})=>r.id===session.state.renderId)?.pose;},{timeout:20000}).toBe('hip');
  await page.getByRole('button',{name:'Photo preview',exact:true}).click();await expect(page.getByRole('button',{name:'Hand on hip',exact:true})).toHaveAttribute('aria-pressed','true');
  expect((await calls(request)).filter(c=>c.provider==='gpu-pose').map(c=>c.pose)).toEqual(['peace','hip']);
});
