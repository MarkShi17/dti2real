import type { GarmentAppearance } from './garments';
import type { Landmark } from './proportions';
import { borderColor, foregroundBounds, garmentReferenceCrop, type ReferenceRect, type ReferenceSource } from './textures';

type LoadedReference={image:HTMLCanvasElement;landmarks:Landmark[];foreground:ReferenceRect;background:[number,number,number]};
export type ClothReference={front:HTMLCanvasElement;fabric:HTMLCanvasElement;source:string;crop:ReferenceRect};
export function createReferenceLoader() {
  const cache=new Map<string,LoadedReference>(),pending=new Map<string,{signal:AbortSignal;promise:Promise<LoadedReference>}>();
  let worker:Worker|undefined,id=0,disposed=false;
  const callbacks=new Map<number,(points:Landmark[])=>void>();
  async function detect(image:HTMLCanvasElement,signal:AbortSignal):Promise<Landmark[]> {
    if(!('Worker' in window) || !('createImageBitmap' in window))return [];
    if(!worker){worker=new Worker('/avatar/texture-worker.js');worker.onmessage=({data})=>callbacks.get(data.id)?.(data.landmarks || []);worker.onerror=()=>{callbacks.forEach(f=>f([]));callbacks.clear();worker?.terminate();worker=undefined;};}
    const bitmap=await createImageBitmap(image),request=++id;
    if(signal.aborted || disposed){bitmap.close();throw new DOMException('Cancelled','AbortError');}
    return await new Promise(resolve=>{
      const finish=(points:Landmark[])=>{clearTimeout(timeout);callbacks.delete(request);signal.removeEventListener('abort',abort);resolve(points);};
      const abort=()=>finish([]),timeout=window.setTimeout(()=>finish([]),20000);
      callbacks.set(request,finish);signal.addEventListener('abort',abort,{once:true});worker!.postMessage({id:request,image:bitmap},[bitmap]);
    });
  }
  async function load(source:ReferenceSource,signal:AbortSignal) {
    const key=source.cacheKey || source.url;
    if(cache.has(key))return cache.get(key)!;
    const underway=pending.get(key);if(underway && !underway.signal.aborted)return underway.promise;
    const promise=(async()=>{
      const response=await fetch(source.url,{credentials:'same-origin',signal});if(!response.ok)throw new Error('The selected product photo is unavailable.');
      const bitmap=await createImageBitmap(await response.blob()),image=document.createElement('canvas');
      const ratio=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));image.width=Math.max(1,Math.round(bitmap.width*ratio));image.height=Math.max(1,Math.round(bitmap.height*ratio));
      image.getContext('2d')!.drawImage(bitmap,0,0,image.width,image.height);bitmap.close();
      const tiny=document.createElement('canvas');tiny.width=128;tiny.height=Math.max(1,Math.round(128*image.height/image.width));const ctx=tiny.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,tiny.width,tiny.height);const pixels=ctx.getImageData(0,0,tiny.width,tiny.height).data;
      const reference={image,landmarks:source.kind==='product'?await detect(image,signal):[],foreground:foregroundBounds(pixels,tiny.width,tiny.height),background:borderColor(pixels,tiny.width,tiny.height)};
      if(signal.aborted || disposed){image.width=1;image.height=1;throw new DOMException('Cancelled','AbortError');}
      cache.set(key,reference);
      if(cache.size>20){const oldest=cache.keys().next().value!;cache.delete(oldest);}
      return reference;
    })();
    pending.set(key,{signal,promise});
    try{return await promise;}finally{if(pending.get(key)?.promise===promise)pending.delete(key);}
  }
  return {
    async reference(source:ReferenceSource,appearance:GarmentAppearance,signal:AbortSignal):Promise<ClothReference> {
      const loaded=await load(source,signal);
      const kind=appearance.template==='dress'?`dress-${appearance.dressLength || 'midi'}`:appearance.template;
      const detected=source.kind==='product'?garmentReferenceCrop(loaded.landmarks,kind):undefined,crop=source.crop || detected || loaded.foreground;
      const front=document.createElement('canvas');front.width=768;front.height=Math.max(128,Math.min(1024,Math.round(front.width*crop.h*loaded.image.height/(crop.w*loaded.image.width))));
      const ctx=front.getContext('2d',{willReadFrequently:true})!;ctx.fillStyle=appearance.color;ctx.fillRect(0,0,front.width,front.height);
      ctx.drawImage(loaded.image,crop.x*loaded.image.width,crop.y*loaded.image.height,crop.w*loaded.image.width,crop.h*loaded.image.height,0,0,front.width,front.height);
      // Extend only photographed cloth into cut-out background regions. The
      // original image remains bounded to this garment; packaging and model skin
      // must never become a second body drawn on the mesh.
      const fabric=document.createElement('canvas');fabric.width=256;fabric.height=256;fabric.getContext('2d')!.drawImage(front,front.width*.42,front.height*.40,front.width*.16,front.height*.18,0,0,256,256);
      const pixels=ctx.getImageData(0,0,front.width,front.height),swatch=fabric.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,256,256),bg=loaded.background;
      const dark=parseInt(appearance.color.slice(1,3),16)+parseInt(appearance.color.slice(3,5),16)+parseInt(appearance.color.slice(5,7),16)<400;
      for(let y=0;y<front.height;y++)for(let x=0;x<front.width;x++){
        const i=(y*front.width+x)*4,r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
        const background=Math.hypot(r-bg[0],g-bg[1],b-bg[2])<55 || (dark && Math.min(r,g,b)>175);
        const skin=dark && appearance.pattern==='solid' && r>100 && r>g*1.15 && g>b*1.1;
        if(background || skin){const j=((y%256)*256+x%256)*4;for(let c=0;c<3;c++)pixels.data[i+c]=swatch.data[j+c];}
      }
      ctx.putImageData(pixels,0,0);
      if(appearance.template==='tights' || appearance.template==='shoes'){
        // Hosiery packaging is a reference for its material, not a printable
        // graphic. Keep a bounded fabric sample and tint its luminance to nylon.
        const values=swatch.data,base=[1,3,5].map(i=>parseInt(appearance.color.slice(i,i+2),16));
        for(let i=0;i<values.length;i+=4){const variation=.75+(values[i]+values[i+1]+values[i+2])/765*.25;for(let c=0;c<3;c++)values[i+c]=base[c]*variation;}
        fabric.getContext('2d')!.putImageData(swatch,0,0);ctx.drawImage(fabric,0,0,front.width,front.height);
      }
      return {front,fabric,source:source.kind,crop};
    },
    dispose(){disposed=true;callbacks.forEach(f=>f([]));callbacks.clear();worker?.terminate();worker=undefined;cache.forEach(value=>{value.image.width=1;value.image.height=1;});cache.clear();pending.clear();},
  };
}
