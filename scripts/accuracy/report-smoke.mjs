import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(process.cwd()+'/docs/accuracy/report.html').href);
 assert.equal(await page.locator('section[id]').count(),11);
 assert.equal(await page.getByRole('heading',{name:'Strict photo matches',exact:true,includeHidden:true}).count(),69);
 await page.locator('#fit10 details').first().locator('summary').click();
 const broken=await page.locator('#fit10 details').first().locator('img').evaluateAll(async imgs=>{
  return (await Promise.all(imgs.map(async img=>{try{await img.decode();return img.naturalWidth>0;}catch{return false;}}))).filter(ok=>!ok).length;
 });
 assert.equal(broken,0);assert.deepEqual(errors,[]);
 assert.equal(await page.getByRole('heading',{name:'raw-ebay · 0/12 accepted',exact:true}).count(),1);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'.accuracy/report-preview.png'});
 console.log('Report browser check passed: 11 outfits, 69 strict panels, decoded comparison photos, scraper diagnostics, no page errors.');
}finally{await browser.close();}
