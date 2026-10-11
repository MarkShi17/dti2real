/* Browser-local, single-image analysis. No image URL or pixels leave this worker. */
/* global Vision */
importScripts('/avatar/vision_bundle.js');
let poseTask, faceTask, workerWebGL;
const webGLGuidance = "Photo personalization needs WebGL 2 in Web Workers, which is unavailable here. Try another browser; if graphics are disabled, enable WebGL and hardware acceleration and reload. Using the default avatar; adjust body proportions manually.";
function supportsWorkerWebGL() {
  if(workerWebGL!==undefined)return workerWebGL;
  try {
    if(typeof OffscreenCanvas==='undefined')return workerWebGL=false;
    const gl=new OffscreenCanvas(1,1).getContext('webgl2');
    if(!gl)return workerWebGL=false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return workerWebGL=true;
  } catch {return workerWebGL=false;}
}
const bounded = v => Math.max(.65, Math.min(1.35, Number.isFinite(v) ? v : 1));
const clamp = v => Math.max(0, Math.min(1, v));
const good = (p, i) => p[i] && (p[i].visibility ?? 1) > .55;
function ratios(p, aspect, silhouette) {
  const r = { shoulder: 1, waist: 1, hips: 1, torso: 1, legs: 1 };
  if (![11,12,23,24].every(i => good(p,i))) return r;
  const shoulderY = (p[11].y+p[12].y)/2, hipY = (p[23].y+p[24].y)/2, torso = hipY-shoulderY;
  if (torso < .05) return r;
  r.shoulder = bounded(Math.abs(p[11].x-p[12].x)*aspect/torso/.72);
  r.hips = bounded(silhouette ? silhouette.hipWidth*aspect/torso/.65 : Math.abs(p[23].x-p[24].x)*aspect/torso/.48);
  r.waist = bounded(silhouette ? silhouette.waistWidth*aspect/torso/.5 : r.hips*.98);
  if ([27,28].every(i => good(p,i))) {
    const leg = (p[27].y+p[28].y)/2-hipY;
    if (leg > .08) { const f=leg/(leg+torso); r.legs=bounded(f/.59);r.torso=bounded((1-f)/.41); }
  }
  return r;
}
function silhouette(mask,p) {
  if (![11,12,23,24].every(i=>good(p,i))) return undefined;
  const data=mask.getAsFloat32Array(), w=mask.width, h=mask.height;
  const center=Math.round((p[23].x+p[24].x)*.5*w);
  function width(y) {
    const row=Math.max(0,Math.min(h-1,Math.round(y*h)))*w;
    let a=Math.min(w-1,Math.max(0,center)),b=a;
    if (data[row+a]<.6) return 0;
    while(a>0 && data[row+a-1]>.6) a--;
    while(b<w-1 && data[row+b+1]>.6) b++;
    return (b-a+1)/w;
  }
  const hipsY=(p[23].y+p[24].y)/2, shouldersY=(p[11].y+p[12].y)/2;
  const waistWidth=width(shouldersY+(hipsY-shouldersY)*.72), hipWidth=width(hipsY);
  return waistWidth && hipWidth ? {waistWidth,hipWidth} : undefined;
}
function bounds(points) {
  if (!points.length) return undefined;
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y), minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const x=clamp(minX-(maxX-minX)*.08),y=clamp(minY-(maxY-minY)*.06);
  return {x,y,w:clamp(maxX+(maxX-minX)*.08)-x,h:clamp(maxY+(maxY-minY)*.06)-y};
}
function skin(image,points) {
  if (!points.length || typeof OffscreenCanvas==='undefined') return undefined;
  const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  if (!ctx) return undefined;
  ctx.drawImage(image,0,0);
  const pixels=[];
  for (const i of [50,101,118,280,330,347]) {
    const p=points[i];if(!p)continue;
    const rgba=ctx.getImageData(Math.floor(clamp(p.x)*(image.width-1)),Math.floor(clamp(p.y)*(image.height-1)),1,1).data;
    pixels.push([...rgba].slice(0,3));
  }
  if(!pixels.length)return undefined;
  const channels=[0,1,2].map(i=>pixels.map(p=>p[i]).sort((a,b)=>a-b)[Math.floor(pixels.length/2)]);
  return '#'+channels.map(x=>x.toString(16).padStart(2,'0')).join('');
}
self.onmessage=async ({data}) => {
  const {image,faceImage,requestId,referenceId,sourceHash,faceReferenceId}=data;
  let poseResult;
  try {
    if(!supportsWorkerWebGL()){self.postMessage({requestId,errorCode:'WEBGL_UNAVAILABLE',error:webGLGuidance});return;}
    const wasm=await Vision.FilesetResolver.forVisionTasks('/avatar/wasm');
    if(!poseTask) poseTask=await Vision.PoseLandmarker.createFromOptions(wasm,{baseOptions:{modelAssetPath:'/avatar/models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:1,outputSegmentationMasks:true,minPoseDetectionConfidence:.5});
    if(!faceTask) faceTask=await Vision.FaceLandmarker.createFromOptions(wasm,{baseOptions:{modelAssetPath:'/avatar/models/face_landmarker.task',delegate:'CPU'},runningMode:'IMAGE',numFaces:1,minFaceDetectionConfidence:.4});
    poseResult=poseTask.detect(image);
    const pose=poseResult.landmarks[0] || [];
    const portrait=faceImage || image;
    let detected=faceTask.detect(portrait).faceLandmarks[0] || [];
    // A full-body photo often makes the face too small for the face detector.
    // Crop a head region from pose ear/eye landmarks and map the mesh back to
    // the original photograph, retaining alignment for the face texture.
    if (!detected.length && !faceImage && [0,7,8].every(i=>good(pose,i))) {
      const nose=pose[0], width=Math.max(Math.abs(pose[7].x-pose[8].x)*1.8,.12), height=width*image.width/image.height*1.3;
      const x=clamp(nose.x-width*.5), y=clamp(nose.y-height*.48), w=Math.min(width,1-x),h=Math.min(height,1-y);
      const crop=new OffscreenCanvas(512,Math.max(1,Math.round(512*h*image.height/(w*image.width))));
      crop.getContext('2d').drawImage(image,x*image.width,y*image.height,w*image.width,h*image.height,0,0,crop.width,crop.height);
      detected=(faceTask.detect(crop).faceLandmarks[0] || []).map(p=>({x:x+p.x*w,y:y+p.y*h,z:p.z*w}));
    }
    const points=detected.map(p=>({x:clamp(p.x),y:clamp(p.y),z:Math.max(-2,Math.min(2,p.z))}));
    const profile={referenceId,sourceHash,...(faceReferenceId ? {faceReferenceId}:{}),proportions:ratios(pose,image.width/image.height,poseResult.segmentationMasks?.[0] ? silhouette(poseResult.segmentationMasks[0],pose) : undefined)};
    if(points.length===468 || points.length===478) {profile.faceLandmarks=points;profile.faceBounds=bounds(points);profile.skinColor=skin(portrait,points);}
    self.postMessage({requestId,profile,bodyDetected:pose.length>0,faceDetected:points.length>0});
  } catch(error) {self.postMessage({requestId,errorCode:'ANALYSIS_FAILED',error:'Photo personalization could not run. Reload the page or try another browser. Using the default avatar; adjust body proportions manually.'});}
  finally {poseResult?.segmentationMasks?.forEach(m=>m.close());image.close();faceImage?.close();}
};
