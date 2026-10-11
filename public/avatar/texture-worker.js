/* Offline body landmarks identify garment-only regions in product photographs. */
/* global Vision */
importScripts('/avatar/vision_bundle.js');
let taskPromise;
self.onmessage=async({data})=>{
  try {
    if(!taskPromise)taskPromise=Vision.FilesetResolver.forVisionTasks('/avatar/wasm').then(wasm=>Vision.PoseLandmarker.createFromOptions(wasm,{baseOptions:{modelAssetPath:'/avatar/models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:1,minPoseDetectionConfidence:.5}));
    const task=await taskPromise,result=task.detect(data.image);
    self.postMessage({id:data.id,landmarks:result.landmarks[0] || []});
  }catch{self.postMessage({id:data.id,landmarks:[]});}
  finally{data.image.close();}
};
