import { it, expect } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { normalizeImage } from '@/lib/images';
import { CompatibleVision } from '@/lib/providers/vision';
import { liveSearch } from '@/lib/providers/shopping';
import { verifyProductMatches } from '@/lib/providers/matching';
import { visualRerank } from '@/lib/providers/rerank';
import { defaultFilters, type Garment, type ProductListing } from '@/lib/schema';
import { guardedFetch, saveJson } from './transport.mjs';
type Case={id:string;file:string;sha256:string;crop?:{x:number;y:number;w:number;h:number}};
async function caseImage(c:Case){
 let input:Buffer=readFileSync('docs/dti_example/'+c.file);
 if(createHash('sha256').update(input).digest('hex')!==c.sha256)throw new Error('Screenshot checksum changed: '+c.id);
 if(c.crop){
  const m=await sharp(input).metadata(),w=m.width!,h=m.height!,left=Math.floor(c.crop.x*w),top=Math.floor(c.crop.y*h);
  input=await sharp(input).extract({left,top,width:Math.min(w-left,Math.floor(c.crop.w*w)),height:Math.min(h-top,Math.floor(c.crop.h*h))}).webp().toBuffer();
 }
 return (await normalizeImage(input)).data;
}
it('runs only the explicitly selected live accuracy phase', async()=>{
 expect(process.env.ACCURACY_LIVE).toBe('true');
 const phase=process.env.ACCURACY_PHASE||'preflight',original=globalThis.fetch;
 globalThis.fetch=guardedFetch({live:true,phase,secrets:[process.env.VISION_API_KEY,process.env.SERPER_API_KEY,process.env.SERPAPI_KEY,process.env.APIFY_TOKEN].filter((v):v is string=>!!v),cap:Number(process.env.ACCURACY_BUDGET_USD||30)});
 try{
  const refs=JSON.parse(readFileSync('docs/accuracy/references.json','utf8'));
  let cases:Case[]=phase==='preflight'?refs.cases.filter((c:Case)=>c.id==='fit5'):refs.cases;
  if(phase==='mixed')cases=[{...refs.cases.find((c:Case)=>c.id==='fit6-left'),id:'fit6-mixed',crop:undefined}];
  mkdirSync('.accuracy/'+phase,{recursive:true});mkdirSync('.accuracy/images',{recursive:true});
  for(const c of cases){
   const path='.accuracy/'+phase+'/'+c.id+'.json';
   if(existsSync(path)&&!JSON.parse(readFileSync(path,'utf8')).error)continue;
   const started=Date.now();
   try{
    const image=await caseImage(c);writeFileSync('.accuracy/images/'+c.id+'.webp',image);
    if((phase.startsWith('shopping')||phase.startsWith('rerank')||phase==='strict')){
     const prediction=JSON.parse(readFileSync('.accuracy/retest/'+c.id+'.json','utf8'));
     const garments:Garment[]=prediction.garments||[];
     const rankings:Record<string,ProductListing[]>={},warnings:Record<string,string[]>={};
     const previous=phase.startsWith('rerank')||phase==='strict'?JSON.parse(readFileSync('.accuracy/'+(phase.endsWith('-all')||phase==='strict'?'shopping-all':'shopping')+'/'+c.id+'.json','utf8')):undefined;
     mkdirSync('.accuracy/'+phase+'/'+c.id,{recursive:true});
     for(let start=0;start<garments.length;start+=2){
      await Promise.all(garments.slice(start,start+2).map(async g=>{
       const checkpoint='.accuracy/'+phase+'/'+c.id+'/'+g.id+'.json';
       if(existsSync(checkpoint)){
        const old=JSON.parse(readFileSync(checkpoint,'utf8'));rankings[g.id]=old.products;warnings[g.id]=old.warnings;return;
       }
       const timer=Date.now();
       let result:{products:ProductListing[];warnings:string[]};
       try{
        result=phase==='strict'?await verifyProductMatches(previous.rankings[g.id]||[],g,image):phase.startsWith('shopping')?await liveSearch(g,defaultFilters):{products:await visualRerank(previous.rankings[g.id]||[],g,image),warnings:[]};
       }catch(e){result={products:phase==='strict'?[]:previous?.rankings[g.id]||[],warnings:[e instanceof Error?e.message:'Search failed']};}
       rankings[g.id]=result.products;warnings[g.id]=result.warnings;
       saveJson(checkpoint,{...result,elapsedMs:Date.now()-timer});
      }));
     }
     saveJson(path,{caseId:c.id,phase,garments,rankings,warnings,elapsedMs:Date.now()-started});
     console.log(c.id+': '+Object.values(rankings).filter(r=>r.length).length+'/'+garments.length+' pieces with candidates');
    }else{
     const baseline='.accuracy/baseline/'+c.id+'.json';
     const cached=phase==='retest'&&existsSync(baseline)?JSON.parse(readFileSync(baseline,'utf8')):undefined;
     const garments=cached?.garments||await new CompatibleVision().analyzeOutfit(image);
     saveJson(path,{caseId:c.id,phase,garments,reusedFrom:cached?.garments?'baseline (recognition unchanged)':undefined,elapsedMs:Date.now()-started});
     console.log(c.id+': '+garments.length+' pieces');
    }
   }catch(e){
    saveJson(path,{caseId:c.id,phase,error:e instanceof Error?e.message:'Unknown error',elapsedMs:Date.now()-started});
    console.log(c.id+': recorded failure');
    if(phase==='preflight')throw e;
   }
  }
 }finally{globalThis.fetch=original;}
});
