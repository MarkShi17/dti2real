import { test, expect, ready, section, seeded } from './helpers';
import type { Page } from '@playwright/test';

async function avatarAvailable(page:Page) {
  const stage=page.getByTestId('avatar-stage');
  await expect.poll(async()=>await stage.getAttribute('data-ready')==='true' || await stage.getByRole('alert').isVisible(),{timeout:30000}).toBe(true);
  if(await stage.getAttribute('data-ready')==='true')return true;
  await expect(stage.getByRole('alert')).toContainText('Enable WebGL');
  await expect(stage.getByRole('button',{name:'Download 3D snapshot'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Photo preview',exact:true})).toBeEnabled();
  return false;
}

async function workerWebGL2(page:Page) {
  return await page.evaluate(async()=>{
    const code=`let supported=false;try{const gl=typeof OffscreenCanvas==='undefined'?null:new OffscreenCanvas(1,1).getContext('webgl2');supported=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}self.postMessage(supported);`;
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url);
    return await new Promise<boolean>((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);};
      const timer=setTimeout(()=>{cleanup();reject(new Error('Worker capability probe timed out'));},10000);
      worker.onmessage=({data})=>{cleanup();resolve(data===true);};worker.onerror=()=>{cleanup();reject(new Error('Worker capability probe failed'));};
    });
  });
}

test('3D body orbits continuously, poses immediately, adjusts proportions, and downloads a snapshot', async ({page}, info) => {
  await ready(page);await section(page,info,2);await page.getByRole('button',{name:'3D avatar',exact:true}).click();
  const stage=page.getByTestId('avatar-stage');
  if(!await avatarAvailable(page)) {
    await page.getByRole('button',{name:'Photo preview',exact:true}).click();
    await expect(page.getByRole('button',{name:'Photo preview',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(stage).toHaveCount(0);
    return;
  }
  await expect(page.locator('.render-button')).toHaveCount(0);
  await expect(stage.getByRole('button',{name:'Download 3D snapshot'})).toBeVisible();
  const canvas=stage.locator('canvas');
  const pixels=()=>canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL());
  const front=await pixels();
  await stage.getByRole('button',{name:'Back',exact:true}).click();await expect.poll(pixels).not.toBe(front);
  await stage.getByRole('button',{name:'Front',exact:true}).click();
  const bounds=(await canvas.boundingBox())!;
  await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.4);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.65,bounds.y+bounds.height*.4,{steps:10});
  const mid=await pixels();await page.mouse.move(bounds.x+bounds.width*.82,bounds.y+bounds.height*.4,{steps:10});expect(await pixels()).not.toBe(mid);await page.mouse.up();
  await stage.getByRole('button',{name:'Reset 3D view'}).click();
  await page.getByRole('button',{name:'Peace sign',exact:true}).click();await expect(stage).toHaveAttribute('data-pose','peace');
  const peace=await pixels();await page.getByRole('button',{name:'Hand on hip',exact:true}).click();await expect(stage).toHaveAttribute('data-pose','hip');await expect.poll(pixels).not.toBe(peace);
  await stage.getByRole('button',{name:'Adjust body proportions'}).click();
  const shoulder=stage.getByRole('slider',{name:'Shoulders proportion'});await shoulder.fill('1.2');await expect(shoulder).toHaveValue('1.2');
  await expect.poll(async()=>{const response=await page.request.get('/api/session');const data=await response.json();return data.state?.avatar?.proportions?.shoulder;}).toBe(1.2);
  const download=page.waitForEvent('download');await stage.getByRole('button',{name:'Download 3D snapshot'}).click();expect((await download).suggestedFilename()).toBe('dti2irl-avatar-hip.png');
});

test('WebGL failure gives visible guidance and keeps normal wardrobe controls usable',async ({page},info)=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type.startsWith('webgl'))return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;
  });
  await ready(page);await section(page,info,2);await page.getByRole('button',{name:'3D avatar',exact:true}).click();
  await expect(page.getByTestId('avatar-stage').getByRole('alert')).toContainText('Enable WebGL',{timeout:30000});
  await expect(page.getByRole('button',{name:'Your photo',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Photo preview',exact:true}).click();
  await expect(page.getByRole('button',{name:'Photo preview',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('avatar-stage')).toHaveCount(0);
});

test('face and body analysis runs in a worker using only bundled model and WASM files',async({page})=>{
  test.setTimeout(90000);
  const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
  await ready(page);
  const supported=await workerWebGL2(page);
  const result=await page.evaluate(async()=>{
    const blob=await (await fetch('/demo/base-runway.webp')).blob(),image=await createImageBitmap(blob);
    const worker=new Worker('/avatar/analysis-worker.js');
    return await new Promise<{error?:string;errorCode?:string;profile?:{faceLandmarks?:unknown[];proportions:Record<string,number>};faceDetected?:boolean;bodyDetected?:boolean}>((resolve,reject)=>{
      const timer=setTimeout(()=>{worker.terminate();reject(new Error('Worker analysis timed out'));},60000);
      worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('Worker failed'));};
      worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();resolve(data);};
      worker.postMessage({requestId:'browser-analysis',referenceId:'06f914bb-d7c8-4b15-91f0-c5f22be6a4fe',sourceHash:'browser-fixture',image},[image]);
    });
  });
  if(!supported){expect(result.errorCode).toBe('WEBGL_UNAVAILABLE');expect(result.error).toMatch(/WebGL 2.*hardware acceleration/);expect(result.error).toContain('default avatar');expect(result.profile).toBeUndefined();return;}
  expect(result.error).toBeUndefined();expect(result.bodyDetected).toBe(true);expect(result.faceDetected).toBe(true);expect(result.profile?.faceLandmarks?.length).toBe(478);expect(Object.values(result.profile!.proportions).every(v=>v>=.65 && v<=1.35)).toBe(true);
  expect(requests.some(url=>/mediapipe.*task/.test(url))).toBe(false);
  expect(requests.filter(url=>/avatar\/(models|wasm)/.test(url)).every(url=>new URL(url).origin===new URL(page.url()).origin)).toBe(true);
});

test('a private person reference initializes face geometry and persists only normalized landmarks, and switching back clears it',async({page},info)=>{
  test.setTimeout(90000);
  await ready(page);const supported=await workerWebGL2(page);
  await section(page,info,2);await page.getByRole('button',{name:'3D avatar',exact:true}).click();
  await page.getByRole('button',{name:'Your photo',exact:true}).click();
  await page.getByRole('checkbox').check();
  const uploaded=page.waitForResponse(r=>r.url().endsWith('/api/upload') && r.request().method()==='POST');
  await page.getByLabel('Person photo file').setInputFiles('public/demo/base-runway.webp');
  const response=await uploaded;expect(response.ok()).toBe(true);const person=await response.json();
  await avatarAvailable(page);
  if(supported){
  await expect.poll(async()=>{const result=await (await page.request.get('/api/session')).json();const profile=result.state?.avatar;return profile?.referenceId===person.id && profile?.sourceHash===person.hash && profile?.faceLandmarks?.length===478;},{timeout:60000}).toBe(true);
  const session=await (await page.request.get('/api/session')).json();expect(JSON.stringify(session.state.avatar)).not.toContain('http');expect(session.state.avatar.faceBounds.w).toBeGreaterThan(0);
  }else{
    await expect(page.getByTestId('avatar-stage').getByText(/Photo personalization needs WebGL 2/)).toBeVisible({timeout:15000});
    await expect(page.getByTestId('avatar-stage').getByText(/Using the default avatar; adjust body proportions manually/)).toBeVisible();
    const session=await (await page.request.get('/api/session')).json();expect(session.state.personId).toBe(person.id);expect(session.state.avatar?.faceLandmarks).toBeUndefined();
    await expect(page.getByTestId('avatar-stage').getByRole('button',{name:'Adjust body proportions'})).toBeEnabled();
  }
  await page.getByRole('button',{name:'Studio model',exact:true}).click();
  await expect.poll(async()=>{const result=await (await page.request.get('/api/session')).json();return result.state?.avatar?.referenceId;}).toBe('studio');
  const after=await (await page.request.get('/api/session')).json();expect(after.state.avatar.faceLandmarks).toBeUndefined();
});

test('swapping a selected product changes the fitted 3D garment color immediately',async({page},info)=>{
  await seeded(page);await section(page,info,2);await page.getByRole('button',{name:'3D avatar',exact:true}).click();
  const available=await avatarAvailable(page),stage=page.getByTestId('avatar-stage'),canvas=stage.locator('canvas');
  const pixels=()=>canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL());
  if(available){await expect(canvas).toHaveAttribute('data-texture-ready','true',{timeout:60000});await expect.poll(async()=>Number(await canvas.getAttribute('data-garment-textures'))).toBeGreaterThan(0);}
  const silver=available?await pixels():undefined;
  await section(page,info,1);await page.getByRole('tab',{name:'bottom',exact:true}).click();
  await page.getByRole('button',{name:'Select Burgundy pleated maxi skirt',exact:true}).click();
  await expect(page.getByRole('button',{name:'Select Burgundy pleated maxi skirt',exact:true})).toHaveAttribute('aria-pressed','true');
  await section(page,info,2);
  if(available){await expect(canvas).toHaveAttribute('data-texture-ready','true',{timeout:60000});await expect.poll(pixels).not.toBe(silver);const count=await canvas.getAttribute('data-render-count');await page.waitForTimeout(500);await expect(canvas).toHaveAttribute('data-render-count',count!);}
  else await expect(stage.getByRole('alert')).toContainText('Enable WebGL');
});
