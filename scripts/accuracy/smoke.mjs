import { spawn } from 'node:child_process';
import { createWriteStream, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const base='http://127.0.0.1:3312';
try{await fetch(base,{signal:AbortSignal.timeout(500)});throw new Error('Port 3312 is occupied; refusing to touch that server.');}catch(e){if(e.message.includes('occupied'))throw e;}
mkdirSync('.accuracy',{recursive:true});
const log=createWriteStream('.accuracy/browser-server.log');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3312'],{env:{...process.env,DEMO_MODE:'true',DATA_DIR:process.cwd()+'/.accuracy/smoke-data'},stdio:['ignore','pipe','pipe']});
server.stdout.pipe(log);server.stderr.pipe(log);
let browser;
try{
 let ready=false;
 for(let i=0;i<40;i++){if(server.exitCode!==null)throw new Error('Smoke server exited.');try{if((await fetch(base+'/api/status')).ok){ready=true;break;}}catch{/* Startup */}await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw new Error('Smoke server did not start.');
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')console.log('Browser console:',m.text());});
 await page.goto(base);
 await page.waitForLoadState('networkidle');
 await expect(page.getByRole('button',{name:'Explore an example',exact:true})).toBeEnabled();
 const upload=page.waitForResponse(r=>r.url().endsWith('/api/upload')&&r.request().method()==='POST');
 await page.getByLabel('Outfit screenshot file').setInputFiles({name:'fit8.avif',mimeType:'image/avif',buffer:readFileSync('docs/dti_example/fit8.avif')});
 let uploaded;
 try{uploaded=await upload;}catch(e){console.log('Page diagnostic:',(await page.locator('body').innerText()).slice(-2000));throw e;}
 if(!uploaded.ok())throw new Error('AVIF upload failed: '+await uploaded.text());
 await expect(page.getByAltText('Original outfit inspiration')).toBeVisible();
 await page.screenshot({path:'.accuracy/browser-avif.png',fullPage:true});
 await page.getByRole('button',{name:'Analyze outfit',exact:true}).first().click();
 await expect(page.getByRole('status')).toContainText('manual');
 if(errors.length)throw new Error(errors.join('; '));
 writeFileSync('.accuracy/browser-smoke.json',JSON.stringify({passed:true,port:3312,checks:['Production server started independently','Real AVIF multipart upload accepted','Normalized screenshot displayed','Analyze action reached honest manual-mode response','No browser page errors'],mode:'UI/API smoke in demo mode; live provider evaluation is separate'},null,2));
 console.log('Browser smoke passed: real AVIF upload, preview, and analyze action on isolated port 3312.');
}finally{if(browser)await browser.close();server.kill('SIGTERM');log.end();}
