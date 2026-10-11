import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),names=['runway','hip','peace','shoulder','lean'];
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage();await page.goto(process.env.POSE_GUIDES_BASE_URL || 'http://127.0.0.1:3212');
const detected=await page.evaluate(async(names)=>{
  const origin=location.origin;
  const code=`importScripts('${origin}/avatar/vision_bundle.js');let task;self.onmessage=async({data})=>{try{if(!task){const wasm=await Vision.FilesetResolver.forVisionTasks('${origin}/avatar/wasm');task=await Vision.PoseLandmarker.createFromOptions(wasm,{baseOptions:{modelAssetPath:'${origin}/avatar/models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:1,minPoseDetectionConfidence:.4});}const result=task.detect(data.image);self.postMessage({name:data.name,landmarks:result.landmarks[0],connections:Vision.PoseLandmarker.POSE_CONNECTIONS});}catch(error){self.postMessage({error:String(error)});}finally{data.image.close();}};`;
  const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'})),worker=new Worker(url),results=[];
  try{for(const name of names){const image=await createImageBitmap(await(await fetch('/demo/base-'+name+'.webp')).blob()),width=image.width,height=image.height;const result=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Pose detection timed out')),30000);worker.onmessage=({data})=>{clearTimeout(timeout);if(data.error)reject(new Error(data.error));else resolve(data);};worker.onerror=()=>reject(new Error('Worker failed'));worker.postMessage({name,image},[image]);});results.push({...result,width,height});}}finally{worker.terminate();URL.revokeObjectURL(url);}return results;
},names);
const records=[];await mkdir(root+'/public/avatar/pose-guides',{recursive:true});
for(const result of detected){
  if(result.landmarks?.length!==33)throw new Error('Expected33 landmarks for '+result.name);
  const data=await page.evaluate(({name,landmarks:p,connections,width,height})=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1024;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,768,1024);
    const relevant=[0,7,8,11,12,13,14,15,16,23,24,25,26,27,28,29,30,31,32],xs=relevant.map(i=>p[i].x*width),ys=relevant.map(i=>p[i].y*height);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min(600/(maxX-minX),856/(maxY-minY));
    const point=i=>({x:384+(p[i].x*width-(minX+maxX)/2)*scale,y:535+(p[i].y*height-(minY+maxY)/2)*scale});
    ctx.lineCap='round';ctx.lineJoin='round';
    const stroke=(a,b,color='#7e8791',lineWidth=10)=>{ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();};
    const circle=(v,r,fill='#fff',outline='#7e8791',lineWidth=5)=>{ctx.beginPath();ctx.arc(v.x,v.y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=lineWidth;ctx.strokeStyle=outline;ctx.stroke();};
    // Standard MediaPipe pose edges; facial identity is replaced by a simple head.
    for(const connection of connections){const a=connection.start,b=connection.end;if(a<11||b<11)continue;if(a>=15&&a<=22&&b>=15&&b<=22)continue;const side=a%2?'#748694':'#91989e';stroke(point(a),point(b),side,a>=23?13:11);}
    for(const i of [11,12,13,14,23,24,25,26,27,28])circle(point(i),6,'#cbd0d4','#7e8791',3);
    const ears=[point(7),point(8)],nose=point(0),shoulders=[point(11),point(12)],head={x:(ears[0].x+ears[1].x)/2,y:(ears[0].y+ears[1].y)/2-4};
    const radius=Math.max(25,Math.min(43,Math.max(Math.hypot(ears[0].x-ears[1].x,ears[0].y-ears[1].y)*.65,Math.hypot(shoulders[0].x-shoulders[1].x,shoulders[0].y-shoulders[1].y)*.16)));
    stroke(head,{x:(shoulders[0].x+shoulders[1].x)/2,y:(shoulders[0].y+shoulders[1].y)/2},'#9aa2aa',9);circle(head,radius,'#fff','#7e8791',5);
    // A small direction marker retains the head turn without facial detail.
    const nx=Math.max(-radius*.55,Math.min(radius*.55,nose.x-head.x)),ny=Math.max(-radius*.3,Math.min(radius*.3,nose.y-head.y));circle({x:head.x+nx,y:head.y+ny},3,'#8a949d','#8a949d',1);
    for(const i of [15,16]){const wrist=point(i),index=point(i===15?19:20);circle(wrist,9,'#fff','#7e8791',4);if(name!=='peace' || i!==(p[15].y<p[16].y?15:16))stroke(wrist,index,'#8a949d',5);}
    if(name==='peace'){
      const raised=p[15].y<p[16].y?15:16,wrist=point(raised),elbow=point(raised===15?13:14);let ux=wrist.x-elbow.x,uy=wrist.y-elbow.y;const length=Math.hypot(ux,uy);ux/=length;uy/=length;
      const palm={x:wrist.x+ux*10,y:wrist.y+uy*10};circle(palm,12,'#fff','#7e8791',4);
      // Explicit index/middle V; pose landmarks do not resolve individual fingers.
      for(const sign of [-1,1])stroke({x:palm.x+sign*(-uy)*4,y:palm.y+sign*ux*4},{x:palm.x+ux*38+sign*(-uy)*13,y:palm.y+uy*38+sign*ux*13},'#7e8791',7);
      stroke({x:palm.x-uy*6,y:palm.y+ux*6},{x:palm.x-uy*17-ux*3,y:palm.y+ux*17-uy*3},'#7e8791',6);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  },result);
  const png=Buffer.from(data,'base64');await writeFile(root+'/public/avatar/pose-guides/'+result.name+'.png',png);
  const source=await readFile(root+'/public/demo/base-'+result.name+'.webp');records.push({name:result.name,sourceSha:createHash('sha256').update(source).digest('hex'),guideSha:createHash('sha256').update(png).digest('hex'),bytes:png.length,width:result.width,height:result.height,minVisibility:Math.min(...[11,12,13,14,15,16,23,24,25,26,27,28].map(i=>result.landmarks[i].visibility))});
}
const model=await readFile(root+'/public/avatar/models/pose_landmarker_lite.task');
await writeFile(root+'/public/avatar/pose-guides/README.md',`# Clothing-free local pose guides\n\nThese 768 × 1024 PNGs are neutral stick figures on a white background. They contain no photograph pixels, garment textures, hair, skin, or identifying facial detail. Their 33 joint coordinates were detected locally from the bundled fictional studio references in \`public/demo/base-{pose}.webp\`.\n\nDetection used the bundled MediaPipe Tasks Vision 1.1.0 PoseLandmarker Lite float16 model, version 1, in a browser Web Worker with the CPU delegate. All JS, WASM and model files were loaded from localhost; no external inference service was called. Pose model SHA-256: \`${createHash('sha256').update(model).digest('hex')}\`. Original MakeHuman/MediaPipe sources and licenses are documented in [../README.md](../README.md). These guides are newly drawn vector-style artwork derived from landmark coordinates, rather than edited or recolored photographs.\n\nRendering preserves the reference image aspect ratio and fits recognized body joints into a 600 × 856 pixel area centered on the 768 × 1024 canvas. Standard \`PoseLandmarker.POSE_CONNECTIONS\` join shoulders, elbows, wrists, pelvis, knees, ankles, heels and toes. A neutral outlined head and wrist circles replace photographic details; the head direction marker follows the detected nose. The peace guide adds an explicit two-finger V because the 33-point body model does not recover individual finger joints.\n\nThese guides communicate approximate posture only. Occluded joints and depth remain estimates from a single photograph, particularly in the three-quarter back pose. They do not encode clothing, exact anatomy, facial identity, or garment fit.\n\n| Pose | Source dimensions | Lowest limb visibility | Source SHA-256 | Guide SHA-256 |\n| --- | --- | --- | --- | --- |\n${records.map(r=>`| ${r.name} | ${r.width} × ${r.height} | ${r.minVisibility.toFixed(3)} | \`${r.sourceSha}\` | \`${r.guideSha}\` |`).join('\n')}\n\nReproduction: load the local PoseLandmarker with \`runningMode: IMAGE\`, \`numPoses: 1\`, \`delegate: CPU\` and \`minPoseDetectionConfidence: 0.4\`; detect each source bitmap, draw the normalized coordinates using the framing and edges above on an empty white canvas, then export PNG. No source bitmap is drawn onto the output canvas.\n`);
console.log(JSON.stringify(records.map(({name,bytes,minVisibility})=>({name,bytes,minVisibility})),null,2));await browser.close();
