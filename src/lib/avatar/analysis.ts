import { avatarProfileSchema, type AvatarProfile } from './profile';
import { clientId } from '@/lib/client-id';
export type AnalysisInput = {personUrl:string;personId:string;sourceHash:string;faceUrl?:string;faceReferenceId?:string};
export type AnalysisResult = {profile:AvatarProfile;bodyDetected:boolean;faceDetected:boolean};
export function analyzePerson(input: AnalysisInput, signal: AbortSignal): Promise<AnalysisResult> {
  return new Promise((resolve,reject) => {
    if (signal.aborted) {reject(new DOMException('Cancelled','AbortError'));return;}
    if (!('Worker' in window) || !('createImageBitmap' in window)) {reject(new Error('Photo analysis requires a browser with Web Workers. Adjust body proportions manually.'));return;}
    const worker=new Worker('/avatar/analysis-worker.js');
    let done=false;
    const finish=(error?:Error,result?:AnalysisResult) => {if(done)return;done=true;worker.terminate();signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(result!);};
    const abort=()=>finish(new DOMException('Cancelled','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    const requestId=clientId();
    worker.onerror=()=>finish(new Error('Local photo analysis could not start. Adjust body proportions manually.'));
    worker.onmessage=({data})=>{
      if(data.requestId!==requestId || signal.aborted)return;
      if(data.error){finish(new Error(`Photo analysis unavailable: ${data.error}. Adjust proportions manually.`));return;}
      const parsed=avatarProfileSchema.safeParse(data.profile);
      if(!parsed.success){finish(new Error('Photo analysis returned incomplete landmarks. Adjust proportions manually.'));return;}
      finish(undefined,{profile:parsed.data,bodyDetected:!!data.bodyDetected,faceDetected:!!data.faceDetected});
    };
    async function bitmap(url:string) {
      const response=await fetch(url,{credentials:'same-origin',signal});
      if(!response.ok)throw new Error('The reference photo is unavailable. Upload it again.');
      const original=await createImageBitmap(await response.blob());
      const ratio=Math.min(1,1280/Math.max(original.width,original.height));
      if(ratio===1)return original;
      const resized=await createImageBitmap(original,{resizeWidth:Math.round(original.width*ratio),resizeHeight:Math.round(original.height*ratio)});original.close();return resized;
    }
    void (async()=>{
      let image:ImageBitmap|undefined,faceImage:ImageBitmap|undefined;
      try {
        image=await bitmap(input.personUrl);
        if(input.faceUrl)faceImage=await bitmap(input.faceUrl);
        if(done || signal.aborted){image.close();faceImage?.close();return;}
        worker.postMessage({referenceId:input.personId,sourceHash:input.sourceHash,faceReferenceId:input.faceReferenceId,image,faceImage,requestId},faceImage?[image,faceImage]:[image]);
      }catch(error){image?.close();faceImage?.close();finish(error instanceof Error?error:new Error('Photo analysis failed'));}
    })();
  });
}
