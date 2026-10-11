#!/usr/bin/env node
/** Builds the approved, local-only fitEXAMPLE demo fixture from studio.glb.
 * Geometry is authored here; the reference image is used only for wardrobe study.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const out=resolve(root,'public/avatar/examples/fitexample-v1');
const source=await readFile(resolve(root,'public/avatar/studio.glb'));
const jsonLength=source.readUInt32LE(12), jsonStart=20, binStart=jsonStart+jsonLength+8;
const gltf=JSON.parse(source.subarray(jsonStart,jsonStart+jsonLength).toString().trim());
const chunks=[source.subarray(binStart)]; let byteLength=chunks[0].length;
const pad=()=>{const n=(4-byteLength%4)%4;if(n){chunks.push(Buffer.alloc(n));byteLength+=n;}};
const add=(array,type,count,componentType=5126,bounds=false)=>{pad();const b=Buffer.from(array.buffer,array.byteOffset,array.byteLength);const offset=byteLength;chunks.push(b);byteLength+=b.length;gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length});const accessor={bufferView:gltf.bufferViews.length-1,componentType,count,type};if(bounds){accessor.min=[0,1,2].map(axis=>Math.min(...Array.from({length:count},(_,i)=>array[i*3+axis])));accessor.max=[0,1,2].map(axis=>Math.max(...Array.from({length:count},(_,i)=>array[i*3+axis])));}gltf.accessors.push(accessor);return gltf.accessors.length-1;};
const material=(name,color,roughness=.75,metallic=0)=>{gltf.materials.push({name,pbrMetallicRoughness:{baseColorFactor:color,roughnessFactor:roughness,metallicFactor:metallic},doubleSided:true});return gltf.materials.length-1;};
const chestJoint=Math.max(0,gltf.nodes.findIndex(n=>n.name==='neck01')),headJoint=Math.max(0,gltf.nodes.findIndex(n=>n.name==='head'));
const sourceBin=source.subarray(binStart);
function read(accessor){const a=gltf.accessors[accessor],view=gltf.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],offset=(view.byteOffset||0)+(a.byteOffset||0);const ctor={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];return new ctor(sourceBin.buffer,sourceBin.byteOffset+offset,a.count*width).slice();}
function normals(p,indices){const n=new Float32Array(p.length);for(let k=0;k<indices.length;k+=3){const a=indices[k]*3,b=indices[k+1]*3,c=indices[k+2]*3,ab=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],ac=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]],x=ab[1]*ac[2]-ab[2]*ac[1],y=ab[2]*ac[0]-ab[0]*ac[2],z=ab[0]*ac[1]-ab[1]*ac[0];for(const i of [a,b,c]){n[i]+=x;n[i+1]+=y;n[i+2]+=z;}}for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;}return n;}
function rigged(name,p,uv,j,w,indices,mat){const attrs={POSITION:add(p,'VEC3',p.length/3,5126,true),NORMAL:add(normals(p,indices),'VEC3',p.length/3),TEXCOORD_0:add(uv,'VEC2',uv.length/2),JOINTS_0:add(j,'VEC4',j.length/4,5123),WEIGHTS_0:add(w,'VEC4',w.length/4)};gltf.meshes.push({name,primitives:[{attributes:attrs,indices:add(new Uint32Array(indices),'SCALAR',indices.length,5125),material:mat}]});gltf.nodes.push({name,mesh:gltf.meshes.length-1,skin:0});gltf.scenes[0].nodes.push(gltf.nodes.length-1);}
function surface(sourceName,name,mat,transform=(x,y,z)=>[x,y,z],keep=()=>true){const node=gltf.nodes.find(n=>n.name===sourceName),a=gltf.meshes[node.mesh].primitives[0].attributes,p=read(a.POSITION),uv=read(a.TEXCOORD_0),j=read(a.JOINTS_0),w=read(a.WEIGHTS_0),src=read(gltf.meshes[node.mesh].primitives[0].indices);for(let i=0;i<p.length;i+=3)p.set(transform(p[i],p[i+1],p[i+2]),i);const indices=[];for(let i=0;i<src.length;i+=3)if(keep(p,src[i])&&keep(p,src[i+1])&&keep(p,src[i+2]))indices.push(src[i],src[i+1],src[i+2]);rigged(name,p,uv,j,w,indices,mat);}
function clippedSurface(sourceName,name,mat,transform,distance){
  const src=gltf.meshes[gltf.nodes.find(n=>n.name===sourceName).mesh].primitives[0],attrs=src.attributes,pp=read(attrs.POSITION),uu=read(attrs.TEXCOORD_0),jj=read(attrs.JOINTS_0),ww=read(attrs.WEIGHTS_0),ii=read(src.indices),p=[],uv=[],j=[],w=[],ind=[],cache=new Map();
  const vertex=i=>({p:transform(pp[i*3],pp[i*3+1],pp[i*3+2]),uv:[uu[i*2],uu[i*2+1]],influences:new Map(Array.from({length:4},(_,k)=>[jj[i*4+k],ww[i*4+k]]))});
  const mix=(a,b,t)=>{const influences=new Map();for(const [joint,weight]of a.influences)influences.set(joint,weight*(1-t));for(const[joint,weight]of b.influences)influences.set(joint,(influences.get(joint)||0)+weight*t);return{p:a.p.map((n,k)=>n+(b.p[k]-n)*t),uv:a.uv.map((n,k)=>n+(b.uv[k]-n)*t),influences};};
  const addVertex=v=>{const key=v.p.map(n=>n.toFixed(7)).join(',')+v.uv.map(n=>n.toFixed(7)).join(',');if(cache.has(key))return cache.get(key);const idx=p.length/3;cache.set(key,idx);p.push(...v.p);uv.push(...v.uv);const weights=[...v.influences].filter(([,weight])=>weight>0).sort((a,b)=>b[1]-a[1]).slice(0,4);const total=weights.reduce((sum,[,n])=>sum+n,0);for(let k=0;k<4;k++){j.push(weights[k]?.[0]||0);w.push((weights[k]?.[1]||0)/total);}return idx;};
  for(let k=0;k<ii.length;k+=3){const tri=[vertex(ii[k]),vertex(ii[k+1]),vertex(ii[k+2])],poly=[];for(let t=0;t<3;t++){const a=tri[t],b=tri[(t+1)%3],da=distance(a.p),db=distance(b.p);if(da>=0)poly.push(a);if((da>=0)!==(db>=0))poly.push(mix(a,b,da/(da-db)));}for(let t=1;t<poly.length-1;t++)ind.push(addVertex(poly[0]),addVertex(poly[t]),addVertex(poly[t+1]));}
  rigged(name,new Float32Array(p),new Float32Array(uv),new Uint16Array(j),new Float32Array(w),ind,mat);
}
function ribbon(name,points,width,mat,joint){const p=[],uv=[],j=[],w=[],ind=[];for(let r=0;r<points.length;r++){const [x,y,z]=points[r];p.push(x-width,y,z,x+width,y,z);uv.push(0,r/(points.length-1),1,r/(points.length-1));j.push(joint,0,0,0,joint,0,0,0);w.push(1,0,0,0,1,0,0,0);}for(let r=0;r<points.length-1;r++)ind.push(r*2,r*2+2,r*2+1,r*2+1,r*2+2,r*2+3);rigged(name,new Float32Array(p),new Float32Array(uv),new Uint16Array(j),new Float32Array(w),ind,mat);}
const green=material('forest-green knit',[.011,.067,.031,1],.94), navy=material('navy wool',[.008,.012,.032,1],.9), burgundy=material('burgundy leather',[.12,.009,.022,1],.46), taupe=material('taupe flats',[.22,.19,.16,1],.66), hair=material('brown bob',[.037,.016,.009,1],.68);
// Preserve MakeHuman garment topology and its interpolated arm/leg weights, then
// expand the clothing envelope. The clipped neckline is continuous and lower on
// the wearer's left (viewer right), leaving that shoulder exposed.
clippedSurface('knit','example-sweater',green,(x,y,z)=>{const torso=Math.abs(x)<.24;const xx=x*(torso?1.19:1.07),yy=y-(torso?.024:0),envelope=Math.sqrt(Math.max(0,1-(xx/.245)**2));const zz=torso?(z>.055?Math.max(.055+(z-.055)*.83,.055+.151*envelope):Math.min(.055+(z-.055)*1.22,.055-.125*envelope)):.055+(z-.055)*1.2;return [xx,yy,zz];},([x,y])=>1.32-.32*x-y);
surface('trousers','example-trousers',navy,(x,y,z)=>{const center=Math.sign(x)*(.095+Math.max(0,.82-y)*.094),blend=Math.max(0,Math.min(1,(.72-y)/.14)),angle=Math.atan2(z-.025,x-center),wideX=center+Math.cos(angle)*.081,wideZ=.025+Math.sin(angle)*.087;return [x*1.09*(1-blend)+wideX*blend,y,(.018+(z-.018)*1.16)*(1-blend)+wideZ*blend];});
surface('shoes','example-flats',taupe,(x,y,z)=>[x,y,z],(p,i)=>p[i*3+1]<.085);
// Closed beveled leather purse with filled front/back panels.
const bagP=[],bagI=[],sides=64,rings=9;
for(let r=0;r<rings;r++)for(let t=0;t<sides;t++){const a=t*Math.PI*2/sides,edge=1-.055*Math.abs((r/(rings-1)-.5)*2);const cx=Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.6,cy=Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.6;bagP.push(-.225+cx*.098*edge,.83+cy*.105*edge,.155+(r/(rings-1)-.5)*.062);}
for(let r=0;r<rings-1;r++)for(let t=0;t<sides;t++){const a=r*sides+t,b=r*sides+(t+1)%sides;bagI.push(a,b,a+sides,b,b+sides,a+sides);}
for(const r of [0,rings-1]){const center=bagP.length/3;bagP.push(-.225,.83,.155+(r/(rings-1)-.5)*.062);for(let t=0;t<sides;t++)bagI.push(center,r*sides+t,r*sides+(t+1)%sides);}
const bp=new Float32Array(bagP),bn=bp.length/3,bu=new Float32Array(bn*2),bj=new Uint16Array(bn*4),bw=new Float32Array(bn*4);for(let i=0;i<bn;i++){bj[i*4]=chestJoint;bw[i*4]=1;bu[i*2]=(bp[i*3]+.323)/.196;bu[i*2+1]=(bp[i*3+1]-.725)/.21;}rigged('example-bag',bp,bu,bj,bw,bagI,burgundy);
ribbon('example-strap',[[.17,1.31,.105],[.11,1.25,.255],[.04,1.17,.265],[-.05,1.05,.235],[-.15,.96,.21],[-.225,.925,.19]],.009,burgundy,chestJoint);
ribbon('example-strap-back',[[.17,1.31,.105],[.17,1.32,-.03],[.10,1.22,-.12],[-.025,1.075,-.145],[-.16,.93,-.09],[-.225,.925,.125]],.009,burgundy,chestJoint);
// Continuous centre-part bob, curved around the skull with an open face.
const hp=[],hu=[],hj=[],hw=[],hi=[],segments=80,levels=30;
for(let r=0;r<=levels;r++)for(let t=0;t<=segments;t++){const u=t/segments,a=u*Math.PI*2,v=r/levels;const front=Math.max(0,Math.sin(a)),face=front**6;const radial=v<.5?Math.sin(v*Math.PI):1-.07*(v-.5)*2;const yy=v<.5?1.533+.094*Math.cos(v*Math.PI):1.533-(v-.5)*2*(.128-.148*face);const strand=.0015*Math.sin(a*32+v*4);hp.push(Math.cos(a)*(.098*radial+strand),yy,.055+Math.sin(a)*(.113*radial+strand));hu.push(u,v);hj.push(headJoint,0,0,0);hw.push(1,0,0,0);}
for(let r=0;r<levels;r++)for(let t=0;t<segments;t++){const a=r*(segments+1)+t,b=a+segments+1;hi.push(a,b,a+1,a+1,b,b+1);}rigged('example-bob',new Float32Array(hp),new Float32Array(hu),new Uint16Array(hj),new Float32Array(hw),hi,hair);
gltf.extras={...(gltf.extras||{}),exampleId:'fitexample-v1',wardrobe:'authored physical mesh; no photo projection'};gltf.buffers[0].byteLength=byteLength;
let json=Buffer.from(JSON.stringify(gltf));const jsonPad=(4-json.length%4)%4;json=Buffer.concat([json,Buffer.alloc(jsonPad,0x20)]);const bin=Buffer.concat([...chunks,Buffer.alloc((4-byteLength%4)%4)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+8+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);const output=Buffer.concat([header,json,bh,bin]);
await mkdir(out,{recursive:true});await writeFile(resolve(out,'avatar.glb'),output);const sha=createHash('sha256').update(output).digest('hex');
await writeFile(resolve(out,'SOURCES.json'),JSON.stringify({id:'fitexample-v1',provenance:{reference:'docs/dti_example/fitEXAMPLE.png',referenceUse:'silhouette and palette study only; no reference pixels included',baseAvatar:'public/avatar/studio.glb (CC0 MakeHuman derivative)'},files:{'avatar.glb':{sha256:sha,bytes:output.length}},generator:'scripts/package-example-avatar.mjs'},null,2)+'\n');
