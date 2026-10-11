import { describe, expect, it } from 'vitest';
import { avatarProfileSchema, studioProfile } from '@/lib/avatar/profile';
import { deformPosition, estimateProportions, faceBoundsFromLandmarks, profileMatches } from '@/lib/avatar/proportions';
import { poseRotations } from '@/lib/avatar/poses';
import { createFaceMapping, FACE_FEATURES } from '@/lib/avatar/face';
import { garmentReferenceSource, garmentReferenceCrop, foregroundBounds, garmentUV } from '@/lib/avatar/textures';

describe('reference facial features',()=>{
  const landmarks=()=>{
    const points=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
    for(const feature of FACE_FEATURES)points[feature.landmark]={x:.5+feature.position[0]/.124,y:.5-(feature.position[1]-1.473)/.164,z:0};
    return points;
  };
  it('changes eye spacing, lip shape and jaw independently while retaining curved depth and the neck',()=>{
    const neutral=landmarks(),changed=landmarks();
    changed[33].x-=.06;changed[263].x+=.06;changed[0].y-=.04;changed[17].y+=.04;changed[172].x-=.06;changed[397].x+=.06;
    const a=createFaceMapping(neutral,{x:0,y:0,w:1,h:1}),b=createFaceMapping(changed,{x:0,y:0,w:1,h:1});
    const eye=FACE_FEATURES.find(f=>f.landmark===33)!.position,lip=FACE_FEATURES.find(f=>f.landmark===0)!.position,jaw=FACE_FEATURES.find(f=>f.landmark===172)!.position;
    expect(b.position(eye)[0]).toBeLessThan(a.position(eye)[0]-.003);
    expect(b.position(lip)[1]).toBeGreaterThan(a.position(lip)[1]+.002);
    expect(b.position(jaw)[0]).toBeLessThan(a.position(jaw)[0]-.003);
    expect(b.position([0,1.35,.08])).toEqual([0,1.35,.08]);
    expect(b.position(eye)[2]).toBeCloseTo(eye[2],3);
  });
  it('aligns reference UVs at feature anchors, bounds extreme landmarks, and preserves nose protrusion',()=>{
    const points=landmarks();points[1].z=-.4;points[33].x=.1;
    const mapping=createFaceMapping(points,{x:0,y:0,w:1,h:1});
    expect(mapping.uv(FACE_FEATURES.find(f=>f.landmark===33)!.position)[0]).toBeCloseTo(.1,3);
    const noseFeature=FACE_FEATURES.find(f=>f.landmark===1)!.position,nose=mapping.position(noseFeature);expect(nose[2]).toBeGreaterThan(noseFeature[2]);expect(nose[2]).toBeLessThan(noseFeature[2]+.012);
    for(const feature of FACE_FEATURES){const p=mapping.position(feature.position);expect(p.every(Number.isFinite)).toBe(true);expect(Math.abs(p[0]-feature.position[0])).toBeLessThanOrEqual(.012);}
  });
});

describe('private avatar profile', () => {
  it('accepts studio or UUID identities and bounded ratios, rejects URLs and malformed face data', () => {
    expect(avatarProfileSchema.safeParse(studioProfile()).success).toBe(true);
    expect(avatarProfileSchema.safeParse({ ...studioProfile(), referenceId: 'https://remote.test/photo' }).success).toBe(false);
    expect(avatarProfileSchema.safeParse({ ...studioProfile(), proportions: { ...studioProfile().proportions, waist: 2 } }).success).toBe(false);
    expect(avatarProfileSchema.safeParse({ ...studioProfile(), faceLandmarks: [{x: .5, y: .5, z: 0}] }).success).toBe(false);
    expect(avatarProfileSchema.safeParse({ ...studioProfile(), personUrl: '/private/photo' }).success).toBe(false);
  });
  it('rejects stale person, source, and close-up references', () => {
    const p = studioProfile();
    expect(profileMatches(p, 'studio', 'studio')).toBe(true);
    expect(profileMatches(p, 'studio', 'new-upload')).toBe(false);
    expect(profileMatches(p, '06f914bb-d7c8-4b15-91f0-c5f22be6a4fe', 'studio')).toBe(false);
    expect(profileMatches({ ...p, faceReferenceId: '06f914bb-d7c8-4b15-91f0-c5f22be6a4fe' }, 'studio', 'studio')).toBe(false);
  });
});

describe('body proportions', () => {
  it('preserves neutral geometry and continuously changes width without changing floor position', () => {
    const p = studioProfile().proportions;
    expect(deformPosition([.2, 1, .1], p)).toEqual([.2, 1, .1]);
    const broad = { ...p, waist: 1.3, legs: 1.2 };
    expect(deformPosition([.2, 1, .1], broad)[0]).toBeGreaterThan(.2);
    expect(deformPosition([.1, 0, .1], broad)[1]).toBe(0);
    const a = deformPosition([.1, .92999, .1], broad)[1];
    const b = deformPosition([.1, .93001, .1], broad)[1];
    expect(Math.abs(a-b)).toBeLessThan(.0001);
    expect(deformPosition([.1, 1.7, .1], broad)[1]).toBeGreaterThan(1.7);
  });
  it('uses photo aspect ratio to estimate shoulders and hips, and stays bounded under occlusion', () => {
    const landmarks = Array.from({length: 33}, () => ({x: .5, y: .5, z: 0, visibility: 1}));
    landmarks[11] = {x: .35, y: .2, z: 0, visibility: 1}; landmarks[12] = {x: .65, y: .2, z: 0, visibility: 1};
    landmarks[23] = {x: .4, y: .55, z: 0, visibility: 1}; landmarks[24] = {x: .6, y: .55, z: 0, visibility: 1};
    landmarks[27] = {x: .4, y: .95, z: 0, visibility: 1}; landmarks[28] = {x: .6, y: .95, z: 0, visibility: 1};
    const portrait = estimateProportions(landmarks, .5);
    const wide = estimateProportions(landmarks, 1);
    expect(wide.shoulder).toBeGreaterThan(portrait.shoulder);
    expect(wide.hips).toBeGreaterThan(portrait.hips);
    expect(Object.values(estimateProportions([], 1))).toEqual([1,1,1,1,1]);
    landmarks[27].visibility = 0; landmarks[28].visibility = 0;
    expect(estimateProportions(landmarks, .5).legs).toBe(1);
    expect(Object.values(wide).every(v => v >= .65 && v <= 1.35)).toBe(true);
  });
  it('keeps face crops inside source pixels and refuses an incomplete mesh', () => {
    expect(faceBoundsFromLandmarks([])).toBeUndefined();
    const points = Array.from({length:478}, (_, i) => ({x: i%2 ? .9 : .8, y: i%2 ? .95 : .75, z: 0}));
    const b = faceBoundsFromLandmarks(points)!;
    expect(b.x + b.w).toBeLessThanOrEqual(1); expect(b.y+b.h).toBeLessThanOrEqual(1);
    expect(b.w).toBeGreaterThan(.1);
  });
});

describe('skeletal poses', () => {
  it('uses five distinct whole-body poses with actual articulated peace fingers', () => {
    const poses = ['runway','hip','peace','shoulder','lean'] as const;
    expect(new Set(poses.map(id => JSON.stringify(poseRotations(id)))).size).toBe(5);
    const peace = poseRotations('peace');
    expect(peace['upperarm01.R']).toBeDefined();
    expect(peace['finger2-1.R'][0]).toBe(0);
    expect(peace['finger3-1.R'][0]).toBe(0);
    expect(peace['finger4-1.R'][0]).toBeGreaterThan(1);
    expect(peace['finger5-1.R'][0]).toBeGreaterThan(1);
    expect(peace['finger2-1.R'][2]).not.toBe(peace['finger3-1.R'][2]);
    expect(poseRotations('hip')['lowerarm01.L']).not.toEqual(peace['lowerarm01.R']);
  });
});

import { garmentAppearance, outfitPlan } from '@/lib/avatar/garments';
import type { Garment, ProductListing } from '@/lib/schema';
describe('fitted garment approximation', () => {
  const garment: Garment = {id:'skirt',name:'Silver mini skirt',category:'bottom',visible:true,confidence:1,searchQueries:[],attributes:{color:['silver'],silhouette:'mini skirt',pattern:'solid'}};
  it('uses the selected product description and color instead of the old screenshot attributes', () => {
    const product: ProductListing = {id:'p',garmentId:'skirt',source:'fixture',title:'Burgundy pleated midi skirt',productUrl:'https://example.test',imageUrl:'/product',condition:'new',thrift:false,isDemo:true};
    const a=garmentAppearance(garment,product);
    expect(a.template).toBe('midiskirt'); expect(a.color).toBe('#713446');
    expect(garmentAppearance(garment).template).toBe('miniskirt');
    expect(garmentAppearance(garment).metalness).toBeGreaterThan(.3);
  });
  it('uses actual trousers and dress templates, preserving pattern and texture hints', () => {
    expect(garmentAppearance({...garment,name:'Wide leg plaid trousers',attributes:{color:['black'],silhouette:'wide leg trousers',pattern:'plaid'}}).template).toBe('trousers');
    expect(garmentAppearance({...garment,name:'Floral midi dress',category:'dress',attributes:{color:['cream'],pattern:'floral'}}).template).toBe('dress');
    expect(garmentAppearance({...garment,attributes:{color:['navy'],pattern:'striped'}}).pattern).toBe('stripes');
  });
});

import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Bone, SkinnedMesh, Vector3, Quaternion } from 'three';
import { rigBoneName, applyRigPose, coveredByClothing } from '@/lib/avatar/rig';
describe('packaged real rig',()=>{
  it('resolves glTF sanitized names to the original anatomical joint names',()=>{
    expect(rigBoneName('upperarm01R')).toBe('upperarm01.R');
    expect(rigBoneName('upperarm01_R')).toBe('upperarm01.R');
    expect(rigBoneName('finger2-1_L')).toBe('finger2-1.L');
  });
  it('actually moves the rigged wrist and curls ring fingers in the loaded GLB',async()=>{
    const bytes=await readFile('public/avatar/studio.glb');
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const bones:Bone[]=[];gltf.scene.traverse(o=>{if(o instanceof Bone)bones.push(o);});
    expect(bones).toHaveLength(163);
    const wrist=bones.find(b=>rigBoneName(b.name)==='wrist.R')!;
    applyRigPose(gltf.scene,'runway');gltf.scene.updateMatrixWorld(true);const neutral=wrist.getWorldPosition(new Vector3());
    applyRigPose(gltf.scene,'peace');gltf.scene.updateMatrixWorld(true);const raised=wrist.getWorldPosition(new Vector3());
    expect(raised.y).toBeGreaterThan(neutral.y+.2);
    expect(bones.find(b=>rigBoneName(b.name)==='finger4-1.R')!.quaternion.angleTo(new Quaternion())).toBeGreaterThan(1);
    const mesh=gltf.scene.getObjectByName('body') as SkinnedMesh;
    const weights=mesh.geometry.getAttribute('skinWeight');for(let i=0;i<weights.count;i+=101)expect(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)).toBeCloseTo(1);
  });
  it('hides covered body surfaces to prevent visible skin through fitted tops and skirts, while retaining the face and hands',()=>{
    expect(coveredByClothing([.075,1.19,.12],['top','miniskirt'])).toBe(true);
    expect(coveredByClothing([.09,.83,.07],['top','miniskirt'])).toBe(true);
    expect(coveredByClothing([.4,.98,.18],['top','miniskirt'])).toBe(false);
    expect(coveredByClothing([0,1.5,.1],['top','miniskirt'])).toBe(false);
    expect(coveredByClothing([.1,.45,.05],['top','miniskirt'])).toBe(false);
  });
});

describe('anatomical hand targets',()=>{
  it('places the hip hand beside the pelvis and faces the raised peace palm toward the camera',async()=>{
    const bytes=await readFile('public/avatar/studio.glb');const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const bone=(name:string)=>{let found!:Bone;gltf.scene.traverse(o=>{if(o instanceof Bone && rigBoneName(o.name)===name)found=o;});return found;};
    applyRigPose(gltf.scene,'hip');gltf.scene.updateMatrixWorld(true);
    const hand=bone('wrist.L').getWorldPosition(new Vector3()),hip=bone('pelvis.L').getWorldPosition(new Vector3());
    expect(hand.distanceTo(hip)).toBeLessThan(.22);
    expect(hand.z-hip.z).toBeGreaterThan(.12);
    expect(hand.y-hip.y).toBeGreaterThan(.10);
    applyRigPose(gltf.scene,'peace');gltf.scene.updateMatrixWorld(true);
    const wrist=bone('wrist.R'),base=bone('finger3-1.R');
    const up=new Vector3().fromArray(base.userData.bindHead).sub(new Vector3().fromArray(wrist.userData.bindHead)).normalize();
    up.applyQuaternion(wrist.getWorldQuaternion(new Quaternion()));
    expect(up.y).toBeGreaterThan(.9);
    expect(bone('finger2-3.R').getWorldPosition(new Vector3()).y).toBeGreaterThan(bone('finger4-3.R').getWorldPosition(new Vector3()).y);
  });
});

it('recognizes skirt length and long sleeve silhouette even when the garment name omits the category',()=>{
  const garment:Garment={id:'maxi',name:'Silver pleats',category:'bottom',visible:true,confidence:1,searchQueries:[],attributes:{color:['silver'],silhouette:'pleated maxi'}};
  expect(garmentAppearance(garment).template).toBe('midiskirt');expect(garmentAppearance(garment).long).toBe(true);
  expect(garmentAppearance({...garment,name:'Midnight knit',category:'top',attributes:{color:['black'],silhouette:'fitted high neck',details:['long sleeves']}}).template).toBe('knit');
});

describe('faithful clothing layers',()=>{
  const garment=(id:string,name:string,category:Garment['category']):Garment=>({id,name,category,visible:true,confidence:1,searchQueries:[],attributes:{color:[]}});
  it('selects sleeveless tank geometry, and preserves a pinafore over knit with two hosiery layers',()=>{
    expect(garmentAppearance(garment('tank','White ribbed tank top','top')).template).toBe('tank');
    const hat={...garment('hat','Black wool beret','headwear'),attributes:{color:['black']}};expect(garmentAppearance(hat,{id:'hat-product',garmentId:'hat',title:'Wool Blend Beret',source:'store',productUrl:'https://store.test',imageUrl:'https://store.test/hat.jpg',condition:'new',thrift:false,isDemo:false}).color).toBe('#242229');
    const plan=outfitPlan([garment('knit','Black long sleeve knit top','top'),garment('dress','Brown gingham sleeveless pinafore mini dress','dress'),garment('tights','Black sheer tights','hosiery'),garment('warmers','White leg warmers','hosiery')],[]);
    expect(plan.map(p=>p.mesh)).toEqual(['knit','dressbodice','miniskirt','tights','legwarmers']);
    expect(plan.find(p=>p.mesh==='legwarmers')?.appearance.color).toBe('#eae3d6');
    expect(plan.find(p=>p.mesh==='tights')?.appearance.sheer).toBe(true);
  });
  it('keeps tank arms visible while covering knit sleeves and only the fitted calf region',()=>{
    expect(coveredByClothing([.30,1.2,.1],['tank'])).toBe(false);
    expect(coveredByClothing([.30,1.2,.1],['knit'])).toBe(true);
    expect(coveredByClothing([.10,.1,.1],['legwarmers'])).toBe(false);
    expect(coveredByClothing([.10,.25,.1],['legwarmers'])).toBe(true);
  });
  it('packages actual sleeveless straps with no arm surfaces, plus fitted long sleeves and separate stockings',async()=>{
    const bytes=await readFile('public/avatar/studio.glb');const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    for(const name of ['tank','knit','dressbodice','tights','legwarmers'])expect(gltf.scene.getObjectByName(name),name).toBeInstanceOf(SkinnedMesh);
    const tank=gltf.scene.getObjectByName('tank') as SkinnedMesh,positions=tank.geometry.attributes.position;
    expect(Math.max(...Array.from({length:positions.count},(_,i)=>Math.abs(positions.getX(i))))).toBeLessThan(.215);
    expect(Array.from({length:positions.count},(_,i)=>positions.getY(i)).some(y=>y>1.35)).toBe(true);
    expect(Math.min(...Array.from({length:positions.count},(_,i)=>positions.getY(i)))).toBeCloseTo(.885,4);
    const chest=Array.from({length:positions.count},(_,i)=>[positions.getX(i),positions.getY(i),positions.getZ(i)]).filter(([x,y,z])=>Math.abs(x)<.08 && y>1.17 && y<1.19 && z>.08);expect(Math.max(...chest.map(v=>v[2]))-Math.min(...chest.map(v=>v[2]))).toBeLessThan(.012);
    const knit=gltf.scene.getObjectByName('knit') as SkinnedMesh;
    expect(Math.max(...Array.from({length:knit.geometry.attributes.position.count},(_,i)=>Math.abs(knit.geometry.attributes.position.getX(i))))).toBeGreaterThan(.39);
    for(const shell of [knit,gltf.scene.getObjectByName('tights') as SkinnedMesh]){const joints=shell.geometry.attributes.skinIndex,weights=shell.geometry.attributes.skinWeight;for(let i=0;i<joints.count;i++){let handWeight=0;for(let j=0;j<4;j++)if(/^(wrist|finger)/.test(rigBoneName(shell.skeleton.bones[joints.getComponent(i,j)].name)))handWeight+=weights.getComponent(i,j);expect(handWeight).toBeLessThanOrEqual(.1);}}
  });
});

describe('bounded original garment textures',()=>{
  it('uses the selected product proxy before an inspiration crop and bounds projection instead of repeating the picture',()=>{
    const g:Garment={id:'tank',name:'White tank',category:'top',visible:true,confidence:1,searchQueries:[],attributes:{color:['white']},bbox:{x:.2,y:.3,w:.4,h:.25}};
    const p:ProductListing={id:'private-product',garmentId:g.id,title:'White tank',source:'retailer',productUrl:'https://retailer.test',imageUrl:'https://retailer.test/photo.jpg',condition:'new',thrift:false,isDemo:false};
    expect(garmentReferenceSource(g,p,'/api/assets/private')).toMatchObject({url:'/api/products/private-product/image',kind:'product'});
    expect(garmentReferenceSource(g,{...p,imageUrl:'https://retailer.test/updated.jpg'})?.cacheKey).not.toBe(garmentReferenceSource(g,p)?.cacheKey);
    expect(garmentReferenceSource(g,undefined,'/api/assets/private')).toEqual({url:'/api/assets/private',kind:'outfit',crop:g.bbox});
    const uv=garmentUV([.1,1.2,.1],{x0:-.2,x1:.2,y0:1,y1:1.4});expect(uv[0]).toBeCloseTo(.75);expect(uv[1]).toBeCloseTo(.5);
    expect(garmentUV([.8,1.8,.1],{x0:-.2,x1:.2,y0:1,y1:1.4})).toEqual([1,1]);
  });
  it('crops photo tops at shoulders and hips, while retaining a flatlay garment foreground',()=>{
    const points=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));points[0].y=.1;
    points[11]={x:.3,y:.2,z:0,visibility:1};points[12]={x:.7,y:.2,z:0,visibility:1};points[23]={x:.35,y:.5,z:0,visibility:1};points[24]={x:.65,y:.5,z:0,visibility:1};points[25].y=.7;points[26].y=.7;points[27].y=.9;points[28].y=.9;
    const crop=garmentReferenceCrop(points,'tank');expect(crop!.y).toBeLessThan(.2);expect(crop!.y+crop!.h).toBeLessThan(.56);
    const rgb=new Uint8ClampedArray(10*10*4).fill(255);for(let y=2;y<8;y++)for(let x=3;x<7;x++){const i=(y*10+x)*4;rgb[i]=30;rgb[i+1]=40;rgb[i+2]=60;}
    const bounds=foregroundBounds(rgb,10,10);expect(bounds.x).toBeLessThanOrEqual(.3);expect(bounds.x+bounds.w).toBeGreaterThanOrEqual(.7);expect(bounds.w).toBeLessThan(.6);
  });
});

import { createHash } from 'node:crypto';
it('bundles the verified body, face/pose models, textures, and both SIMD and fallback WASM without runtime CDNs',async()=>{
  const manifest=JSON.parse(await readFile('public/avatar/SOURCES.json','utf8'));
  expect(manifest.makehumanCommit).toBe('a8bc2d54ff0ac92e78ff71431b1023eda42bf482');
  for(const name of ['studio.glb','analysis-worker.js','vision_bundle.js','textures/skin.jpg','textures/hair.png','models/face_landmarker.task','models/pose_landmarker_lite.task','wasm/vision_wasm_internal.js','wasm/vision_wasm_internal.wasm','wasm/vision_wasm_nosimd_internal.js','wasm/vision_wasm_nosimd_internal.wasm']){
    const data=await readFile(`public/avatar/${name}`);expect(data.length).toBeGreaterThan(100);expect(createHash('sha256').update(data).digest('hex')).toBe(manifest.files[name].sha256);
  }
  const worker=await readFile('public/avatar/analysis-worker.js','utf8');expect(worker).not.toMatch(/https?:\/\//);
});

import { createContext, runInContext } from 'node:vm';
describe('local analysis capability failures',()=>{
  async function runWorker(gl:object|null) {
    const messages:Array<{error?:string;errorCode?:string;profile?:unknown}>=[];let closed=0,started=0;
    const context=createContext({importScripts:()=>{},self:{postMessage:(message:typeof messages[number])=>messages.push(message)},OffscreenCanvas:class {getContext(){return gl;}},Vision:{FilesetResolver:{forVisionTasks:async()=>{started++;return {};}},PoseLandmarker:{createFromOptions:async()=>{throw new Error('GLctx.activeTexture private runtime detail');}}}});
    runInContext(await readFile('public/avatar/analysis-worker.js','utf8'),context);
    await context.self.onmessage({data:{requestId:'capability-fixture',image:{close:()=>closed++},faceImage:{close:()=>closed++}}});
    return {messages,closed,started};
  }
  it('reports missing worker WebGL without starting models or inventing landmarks and closes both images',async()=>{
    const result=await runWorker(null);expect(result.started).toBe(0);expect(result.closed).toBe(2);
    expect(result.messages[0].errorCode).toBe('WEBGL_UNAVAILABLE');expect(result.messages[0].error).toMatch(/WebGL 2.*hardware acceleration/i);expect(result.messages[0].profile).toBeUndefined();
  });
  it('keeps supported-browser model failures distinct and hides internal GL error strings',async()=>{
    const result=await runWorker({getExtension:()=>null});expect(result.started).toBe(1);expect(result.closed).toBe(2);
    expect(result.messages[0].errorCode).toBe('ANALYSIS_FAILED');expect(result.messages[0].error).toMatch(/reload|another browser/i);expect(result.messages[0].error).not.toMatch(/GLctx|activeTexture/);expect(result.messages[0].profile).toBeUndefined();
  });
});
