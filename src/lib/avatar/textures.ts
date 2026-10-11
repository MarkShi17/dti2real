import type { Garment, ProductListing } from '@/lib/schema';
import type { Landmark } from './proportions';
export type ReferenceRect={x:number;y:number;w:number;h:number};
export type ProjectionBounds={x0:number;x1:number;y0:number;y1:number};
export type ReferenceSource={url:string;kind:'product'|'outfit';cacheKey?:string;crop?:ReferenceRect};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
function rect(x0:number,y0:number,x1:number,y1:number):ReferenceRect {const x=clamp(x0),y=clamp(y0);return {x,y,w:Math.max(.001,clamp(x1)-x),h:Math.max(.001,clamp(y1)-y)};}
export function garmentReferenceSource(g:Garment,p?:ProductListing,outfitUrl?:string):ReferenceSource|undefined {
  if(p)return {url:`/api/products/${encodeURIComponent(p.id)}/image`,kind:'product',cacheKey:JSON.stringify([p.id,p.imageUrl,p.title,p.variant])};
  if(outfitUrl && g.bbox)return {url:outfitUrl,kind:'outfit',crop:g.bbox};
  return undefined;
}
export function garmentReferenceCrop(points:Landmark[],template:string):ReferenceRect|undefined {
  const good=(i:number)=>points[i] && (points[i].visibility ?? 1)>.5;
  if(points.length!==33 || ![0,11,12,23,24].every(good))return undefined;
  const shoulderY=(points[11].y+points[12].y)/2,hipY=(points[23].y+points[24].y)/2;
  if(points[0].y>=shoulderY || hipY-shoulderY<.1)return undefined;
  const center=(points[23].x+points[24].x)/2,halfWidth=Math.max(Math.abs(points[11].x-points[12].x)*.64,Math.abs(points[23].x-points[24].x)*.78);
  const knee=[25,26].every(good)?(points[25].y+points[26].y)/2:hipY+.2;
  const ankle=[27,28].every(good)?(points[27].y+points[28].y)/2:knee+.2;
  let y0=shoulderY-.02,y1=hipY+.02;
  if(['miniskirt','midiskirt','trousers','tights','legwarmers','shoes'].includes(template))y0=hipY-.025;
  if(template==='miniskirt')y1=hipY+(knee-hipY)*.56;
  if(template==='midiskirt')y1=knee+(ankle-knee)*.7;
  if(['trousers','tights'].includes(template))y1=ankle+.025;
  if(template==='legwarmers'){y0=knee+(ankle-knee)*.1;y1=ankle+.035;}
  if(template==='shoes'){y0=ankle-.025;y1=Math.max(...[29,30,31,32].filter(good).map(i=>points[i].y),ankle+.07)+.015;}
  if(template==='dress' || template==='dress-midi')y1=knee+(ankle-knee)*.3;
  if(template==='dress-mini')y1=hipY+(knee-hipY)*.56;
  if(template==='dress-maxi')y1=ankle+.02;
  return rect(center-halfWidth,y0,center+halfWidth,y1);
}
export function borderColor(rgba:Uint8ClampedArray,width:number,height:number):[number,number,number] {
  const channels:[number[],number[],number[]]=[[],[],[]];
  for(let i=0;i<width;i+=Math.max(1,Math.floor(width/24)))for(const y of [0,height-1])for(let c=0;c<3;c++)channels[c].push(rgba[(y*width+i)*4+c]);
  for(let i=0;i<height;i+=Math.max(1,Math.floor(height/24)))for(const x of [0,width-1])for(let c=0;c<3;c++)channels[c].push(rgba[(i*width+x)*4+c]);
  return channels.map(values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]) as [number,number,number];
}
export function foregroundBounds(rgba:Uint8ClampedArray,width:number,height:number):ReferenceRect {
  const bg=borderColor(rgba,width,height);let x0=width,y0=height,x1=0,y1=0,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(Math.hypot(rgba[i]-bg[0],rgba[i+1]-bg[1],rgba[i+2]-bg[2])>38 && rgba[i+3]>64){x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);count++;}}
  if(count<width*height*.005)return {x:.02,y:.02,w:.96,h:.96};
  return rect(x0/width-.02,y0/height-.02,x1/width+.02,y1/height+.02);
}
export function garmentUV([x,y]:[number,number,number],bounds:ProjectionBounds):[number,number] {
  return [clamp((x-bounds.x0)/(bounds.x1-bounds.x0)),clamp((y-bounds.y0)/(bounds.y1-bounds.y0))];
}
export function projectionBounds(template:string,cropped=false,long=false):ProjectionBounds {
  if(template==='dress')return {x0:-.24,x1:.24,y0:long?.16:.69,y1:1.405};
  if(['tank','knit','top','blouse','jacket','dressbodice'].includes(template))return {x0:-.20,x1:.20,y0:cropped?1.055:template==='tank'?.885:.94,y1:1.405};
  if(template==='miniskirt')return {x0:-.235,x1:.235,y0:.69,y1:.947};
  if(template==='midiskirt')return {x0:-.28,x1:.28,y0:long?.16:.52,y1:.947};
  if(template==='legwarmers')return {x0:-.16,x1:.16,y0:.045,y1:.47};
  if(template==='shoes')return {x0:-.19,x1:.19,y0:-.02,y1:.16};
  return {x0:-.24,x1:.24,y0:.04,y1:.947};
}
