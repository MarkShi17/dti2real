import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Garment, PoseId, ProductListing } from '@/lib/schema';
import type { AvatarProfile } from './profile';
import { deformPosition } from './proportions';
import { applyRigPose, rigBoneName, coveredByClothing } from './rig';
import { outfitPlan, type OutfitPiece, type GarmentAppearance } from './garments';
import { createReferenceLoader } from './texture-reference';
import { garmentReferenceSource, garmentUV, projectionBounds } from './textures';
import { createFaceMapping } from './face';
import { coveredByExampleClothing, exampleFixtureId, exampleMeshNames, isExampleOutfitSelection } from './example-outfit';

type MeshState = {mesh:THREE.SkinnedMesh;position:Float32Array;uv:Float32Array;index:THREE.BufferAttribute|null};
export type AvatarRenderer = {
  setProfile:(profile:AvatarProfile,faceUrl?:string)=>Promise<void>;
  setOutfit:(garments:Garment[],products:ProductListing[],outfitUrl?:string)=>void;
  setPose:(pose:PoseId)=>void;
  view:(side:'front'|'back'|'reset')=>void;
  zoom:(delta:number)=>void;
  snapshot:()=>Promise<Blob>;
  dispose:()=>void;
};
export type AvatarRendererOptions = { exampleId?: typeof exampleFixtureId };
function materialList(mesh:THREE.Mesh) {return Array.isArray(mesh.material)?mesh.material:[mesh.material];}
function disposeGroup(group:THREE.Object3D) {
  const textures=new Set<THREE.Texture>(), materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>();
  group.traverse(obj=>{if(obj instanceof THREE.Mesh){geometries.add(obj.geometry);materialList(obj).forEach(mat=>{materials.add(mat);for(const value of Object.values(mat))if(value instanceof THREE.Texture)textures.add(value);});}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{if(t.image instanceof ImageBitmap)t.image.close();t.dispose();});
}
function patterned(a:GarmentAppearance) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=a.color;ctx.fillRect(0,0,256,256);
  if(a.pattern!=='solid') {
    ctx.fillStyle='#ffffff70';ctx.strokeStyle='#ffffff70';ctx.lineWidth=5;
    if(a.pattern==='stripes' || a.pattern==='plaid')for(let x=0;x<256;x+=32){ctx.fillRect(x,0,8,256);if(a.pattern==='plaid'){ctx.fillRect(0,x,256,6);ctx.fillStyle='#1f1b2845';ctx.fillRect(x+14,0,3,256);ctx.fillRect(0,x+14,256,3);ctx.fillStyle='#ffffff70';}}
    if(a.pattern==='dots' || a.pattern==='floral')for(let x=16;x<256;x+=40)for(let y=16;y<256;y+=40){if(a.pattern==='dots'){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}else{for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(x+Math.cos(i*1.256)*5,y+Math.sin(i*1.256)*5,4,2,i*1.256,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#ccb465';ctx.fillRect(x-1,y-1,2,2);ctx.fillStyle='#ffffff70';}}
  }
  // Fine deterministic weave preserves surface detail under studio lights.
  ctx.strokeStyle='#0000000c';ctx.lineWidth=1;
  for(let y=0;y<256;y+=3){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(5,5);texture.anisotropy=4;
  return new THREE.MeshStandardMaterial({map:texture,roughness:a.roughness,metalness:a.metalness,side:THREE.DoubleSide});
}

export async function createAvatarRenderer(host:HTMLElement, onError:(message:string)=>void, signal:AbortSignal,onTextureNotice:(message:string)=>void=()=>{},options:AvatarRendererOptions={}):Promise<AvatarRenderer> {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  let disposed=false,frame=0,faceRevision=0,outfitRevision=0;
  const references=createReferenceLoader();let outfitAbort=new AbortController();
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e3dc');
  const camera=new THREE.PerspectiveCamera(34,1,.02,30);camera.position.set(0,.95,3.45);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.domElement.setAttribute('aria-label','Interactive 3D avatar. Drag to rotate, scroll or pinch to zoom.');renderer.domElement.setAttribute('role','img');renderer.domElement.dataset.avatarCanvas='true';
  renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;outline-offset:-4px';renderer.domElement.tabIndex=0;
  host.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.83,0);controls.enablePan=false;controls.minDistance=1.6;controls.maxDistance=5.8;controls.minPolarAngle=.2;controls.maxPolarAngle=Math.PI-.2;controls.rotateSpeed=.65;controls.zoomSpeed=.65;controls.enableDamping=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;controls.dampingFactor=.16;
  const demo=options.exampleId===exampleFixtureId;
  scene.add(new THREE.HemisphereLight('#fff6eb','#96808d',demo?2.55:2.2));
  const key=new THREE.DirectionalLight('#fff7ee',demo?2.65:3.1);key.position.set(-2,4,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-1.5;key.shadow.camera.right=1.5;key.shadow.camera.top=2.5;key.shadow.camera.bottom=-.5;key.shadow.camera.near=.5;key.shadow.camera.far=10;key.shadow.bias=-.0005;key.shadow.normalBias=.01;scene.add(key);
  const fill=new THREE.DirectionalLight('#dae2ff',demo?1.35:1.1);fill.position.set(2,2,-2);scene.add(fill);if(demo){const rim=new THREE.DirectionalLight('#f2d7ce',.75);rim.position.set(-3,2,-3);scene.add(rim);}
  const ground=new THREE.Mesh(new THREE.CircleGeometry(5,96),new THREE.MeshStandardMaterial({color:'#e9e3dc',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.005;ground.receiveShadow=true;scene.add(ground);
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.47,.49,.025,64),new THREE.MeshStandardMaterial({color:'#ded5ce',roughness:.85}));pedestal.position.y=-.018;pedestal.receiveShadow=true;scene.add(pedestal);
  const accessories=new THREE.Group();scene.add(accessories);
  let avatar:THREE.Group|undefined;
  const meshes=new Map<string,MeshState>(),bones=new Map<string,THREE.Bone>(),bindHeads=new Map<string,THREE.Vector3>();
  const ownedTextures=new Set<THREE.Texture>();const handVertices=new Set<number>();
  let profile:AvatarProfile|undefined, currentPose:PoseId='runway', faceOverlay:THREE.SkinnedMesh|undefined;
  const clothing=new Map<string,OutfitPiece>();
  let faceMapping:ReturnType<typeof createFaceMapping>|undefined;
  const faceAbort=new AbortController();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionChanged=()=>{controls.enableDamping=!reduced.matches;};reduced.addEventListener('change',motionChanged);
  const renderNow=()=>{if(!disposed && !renderer.getContext().isContextLost()){renderer.render(scene,camera);renderer.domElement.dataset.renderCount=String(Number(renderer.domElement.dataset.renderCount || 0)+1);}};
  const draw=()=>{if(disposed || frame)return;frame=requestAnimationFrame(()=>{frame=0;controls.update();renderNow();});};
  const resize=()=>{if(disposed)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw();};
  const observer=new ResizeObserver(resize);observer.observe(host);
  const lost=(event:Event)=>{event.preventDefault();onError('3D graphics were interrupted. Reload the page to restore the avatar, or use a browser with WebGL enabled.');};renderer.domElement.addEventListener('webglcontextlost',lost);
  const keydown=(event:KeyboardEvent)=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Home'){view('reset');return;}
    if(event.key==='+' || event.key==='-'){zoom(event.key==='+'?-.2:.2);return;}
    const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
    if(event.key==='ArrowLeft')spherical.theta-=.16;if(event.key==='ArrowRight')spherical.theta+=.16;
    if(event.key==='ArrowUp')spherical.phi=Math.max(.2,spherical.phi-.12);if(event.key==='ArrowDown')spherical.phi=Math.min(Math.PI-.2,spherical.phi+.12);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();draw();
  };renderer.domElement.addEventListener('keydown',keydown);
  controls.addEventListener('change',draw);
  resize();
  function dispose() {
    if(disposed)return;disposed=true;faceRevision++;outfitRevision++;faceAbort.abort();outfitAbort.abort();references.dispose();cancelAnimationFrame(frame);observer.disconnect();reduced.removeEventListener('change',motionChanged);controls.removeEventListener('change',draw);controls.dispose();renderer.domElement.removeEventListener('keydown',keydown);renderer.domElement.removeEventListener('webglcontextlost',lost);disposeGroup(scene);ownedTextures.forEach(t=>t.dispose());bones.forEach(b=>{if(b.parent)b.parent.remove(b);});meshes.forEach(({mesh})=>mesh.skeleton.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();signal.removeEventListener('abort',dispose);
  }
  signal.addEventListener('abort',dispose,{once:true});
  function view(side:'front'|'back'|'reset') {
    const distance=side==='reset'?3.45:camera.position.distanceTo(controls.target);
    controls.target.set(0,.83,0);camera.position.set(0,.95,side==='back'?-distance:distance);controls.update();draw();
  }
  function zoom(delta:number) {const offset=camera.position.clone().sub(controls.target),distance=THREE.MathUtils.clamp(offset.length()+delta,controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance));controls.update();draw();}
  function applyPose() {
    if(!avatar)return;
    avatar.position.set(0,0,0);
    applyRigPose(avatar,currentPose);
    avatar.updateMatrixWorld(true);
    // Ground the shoe soles after skeletal rotations; sample actual skinned verts.
    let bottom=Infinity;
    const state=meshes.get('shoes');
    if(state){state.mesh.skeleton.update();const v=new THREE.Vector3();for(let i=0;i<state.mesh.geometry.attributes.position.count;i+=3){state.mesh.getVertexPosition(i,v);bottom=Math.min(bottom,v.y);}}
    if(Number.isFinite(bottom))avatar.position.y=-bottom;
    avatar.updateMatrixWorld(true);updateAccessories();renderer.shadowMap.needsUpdate=true;draw();
  }
  function deform() {
    if(!profile || !avatar)return;
    bones.forEach(b=>b.rotation.set(0,0,0));avatar.position.set(0,0,0);
    for(const [name,bone] of bones) {
      const h=bindHeads.get(name)!;const target=new THREE.Vector3(...deformPosition([h.x,h.y,h.z],profile.proportions));
      if(bone.parent instanceof THREE.Bone){const p=bindHeads.get(rigBoneName(bone.parent.name))!;target.sub(new THREE.Vector3(...deformPosition([p.x,p.y,p.z],profile.proportions)));}
      bone.position.copy(target);
    }
    for(const [name,state] of meshes) {
      const attr=state.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const a=clothing.get(name)?.appearance;
      for(let i=0;i<attr.count;i++) {
        let x=state.position[i*3],y=state.position[i*3+1],z=state.position[i*3+2];
        if(faceMapping && ['body','eyes','eyebrows','eyelashes'].includes(name))[x,y,z]=faceMapping.position([x,y,z]);
        if(a?.wide && (name.includes('skirt') || name==='trousers')){
          const flare=THREE.MathUtils.clamp((.947-y)/(name==='miniskirt'?.257:.65),0,1)*.045;
          if(name==='trousers')x+=Math.sign(x)*flare;else{x*=1+flare*5;z*=1+flare*5;}
        }
        if(a?.long && name==='midiskirt' && y<.947)y=.16+(y-.52)*(.947-.16)/(.947-.52);
        if(a?.cropped && ['top','blouse','tank','knit'].includes(name) && y<1.06)y=1.06+(y-.86)*.35;
        const v=deformPosition([x,y,z],profile.proportions);attr.setXYZ(i,...v);
      }
      attr.needsUpdate=true;state.mesh.geometry.computeVertexNormals();state.mesh.geometry.computeBoundingSphere();
    }
    avatar.updateMatrixWorld(true);
    const skeletons=new Set<THREE.Skeleton>();meshes.forEach(({mesh})=>skeletons.add(mesh.skeleton));
    skeletons.forEach(s=>s.calculateInverses());
    if(faceOverlay){const body=meshes.get('body')!.mesh;(faceOverlay.geometry.getAttribute('position') as THREE.BufferAttribute).copy(body.geometry.getAttribute('position') as THREE.BufferAttribute);const p=faceOverlay.geometry.getAttribute('position') as THREE.BufferAttribute;for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)+.0007);p.needsUpdate=true;}
    applyPose();
  }
  function removeFace() {if(!faceOverlay)return;avatar?.remove(faceOverlay);faceOverlay.geometry.dispose();materialList(faceOverlay).forEach(mat=>{if(mat instanceof THREE.MeshStandardMaterial)mat.map?.dispose();mat.dispose();});faceOverlay=undefined;}
  async function setProfile(next:AvatarProfile,faceUrl?:string) {
    profile=next;faceMapping=next.faceLandmarks && next.faceBounds?createFaceMapping(next.faceLandmarks,next.faceBounds):undefined;
    faceRevision++;const revision=faceRevision;removeFace();deform();
    const body=meshes.get('body')?.mesh;
    if(body && body.material instanceof THREE.MeshStandardMaterial)body.material.color.set(demo ? '#e4bd9e' : next.skinColor ? new THREE.Color(next.skinColor).lerp(new THREE.Color('#ffffff'),.6) : '#ffffff');
    if(!faceUrl || !next.faceBounds || !next.faceLandmarks || !body || !avatar)return;
    const response=await fetch(faceUrl,{credentials:'same-origin',signal:faceAbort.signal});if(!response.ok)throw new Error('The face reference is unavailable. Upload it again.');
    const image=await createImageBitmap(await response.blob());
    if(disposed || revision!==faceRevision){image.close();return;}
    const b=next.faceBounds;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=768;const ctx=canvas.getContext('2d')!;
    ctx.drawImage(image,b.x*image.width,b.y*image.height,b.w*image.width,b.h*image.height,0,0,512,768);image.close();
    ctx.globalCompositeOperation='destination-in';const gradient=ctx.createRadialGradient(256,365,150,256,365,345);gradient.addColorStop(0,'#000');gradient.addColorStop(.75,'#000');gradient.addColorStop(1,'#0000');ctx.save();ctx.translate(256,384);ctx.scale(1,1.48);ctx.translate(-256,-384);ctx.fillStyle=gradient;ctx.fillRect(0,0,512,768);ctx.restore();
    const geometry=body.geometry.clone(),uv=geometry.getAttribute('uv') as THREE.BufferAttribute, rest=meshes.get('body')!.position,indices:number[]=[];
    const face=(i:number)=>rest[i*3+1]>1.389 && rest[i*3+1]<1.564 && Math.abs(rest[i*3])<.068 && rest[i*3+2]>.097;
    const index=body.geometry.index!;for(let i=0;i<index.count;i+=3){const a=index.getX(i),bb=index.getX(i+1),c=index.getX(i+2);if(face(a)&&face(bb)&&face(c))indices.push(a,bb,c);}
    for(let i=0;i<uv.count;i++){const mapped=faceMapping!.uv([rest[i*3],rest[i*3+1],rest[i*3+2]]);uv.setXY(i,...mapped);}
    uv.needsUpdate=true;geometry.setIndex(indices);
    const pos=geometry.getAttribute('position') as THREE.BufferAttribute;for(let i=0;i<pos.count;i++)pos.setZ(i,pos.getZ(i)+.0007);pos.needsUpdate=true;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const mat=new THREE.MeshPhysicalMaterial({map:texture,transparent:true,depthWrite:false,roughness:.7,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    faceOverlay=new THREE.SkinnedMesh(geometry,mat);faceOverlay.name='reference-face';faceOverlay.bind(body.skeleton,body.bindMatrix);faceOverlay.frustumCulled=false;avatar.add(faceOverlay);draw();
  }
  function attachAccessory(a:GarmentAppearance) {
    const material=new THREE.MeshPhysicalMaterial({color:a.color,roughness:a.roughness,metalness:a.metalness});
    const group=new THREE.Group();
    if(a.template==='bag') {
      const shape=new THREE.Shape();shape.moveTo(-.07,-.055);shape.lineTo(.07,-.055);shape.quadraticCurveTo(.09,-.055,.09,-.035);shape.lineTo(.09,.045);shape.quadraticCurveTo(.09,.065,.07,.065);shape.lineTo(-.07,.065);shape.quadraticCurveTo(-.09,.065,-.09,.045);shape.lineTo(-.09,-.035);shape.quadraticCurveTo(-.09,-.055,-.07,-.055);
      const bag=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.055,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.006,bevelThickness:.006}),material);bag.castShadow=true;group.add(bag);
      const handle=new THREE.Mesh(new THREE.TorusGeometry(.055,.006,8,40,Math.PI),material);handle.position.y=.064;group.add(handle);handle.visible=false;const strapCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.06,.05,.02),new THREE.Vector3(-.08,.25,.02),new THREE.Vector3(-.05,.36,.02),new THREE.Vector3(.065,.05,.02)]);const strap=new THREE.Mesh(new THREE.TubeGeometry(strapCurve,36,.005,6,false),material);group.add(strap);group.userData.anchor='neck01';group.userData.offset=new THREE.Vector3(.20,-.34,.055);
    } else if(a.template==='belt') {
      const band=new THREE.Mesh(new THREE.TorusGeometry(.128,.008,8,64),material);band.rotation.x=Math.PI/2;band.scale.y=.82;group.add(band);const buckle=new THREE.Mesh(new THREE.BoxGeometry(.025,.019,.005),new THREE.MeshStandardMaterial({color:'#bcae96',metalness:.8,roughness:.3}));buckle.position.set(0,0,.111);group.add(buckle);group.userData.anchor='neck01';group.userData.offset=new THREE.Vector3(0,-.347,.005);group.userData.waistBelt=true;
    } else if(a.template==='jewelry') {
      const necklace=new THREE.Mesh(new THREE.TorusGeometry(.063,.0025,8,64),material);necklace.rotation.x=Math.PI/2;necklace.scale.z=1.15;group.add(necklace);
      const charm=new THREE.Mesh(new THREE.SphereGeometry(.007,12,8),material);charm.position.set(0,-.013,.073);group.add(charm);group.userData.anchor='neck01';group.userData.offset=new THREE.Vector3(0,-.025,.008);
    } else if(a.template==='headwear') {
      const crown=new THREE.Mesh(new THREE.SphereGeometry(.105,32,20),material);crown.scale.set(1,.42,.9);crown.position.y=.025;group.add(crown);const brim=new THREE.Mesh(new THREE.TorusGeometry(.099,.008,8,48),material);brim.rotation.x=Math.PI/2;brim.scale.z=.6;group.add(brim);group.userData.anchor='head';group.userData.offset=new THREE.Vector3(0,.123,.016);
    } else {material.dispose();return;}
    accessories.add(group);return group;
  }
  function updateAccessories() {
    for(const obj of accessories.children){if(obj.userData.waistBelt)obj.scale.set(profile?.proportions.waist || 1,1,profile?.proportions.waist || 1);const bone=bones.get(obj.userData.anchor);if(!bone)continue;bone.getWorldPosition(obj.position);bone.getWorldQuaternion(obj.quaternion);obj.position.add((obj.userData.offset as THREE.Vector3).clone().applyQuaternion(obj.quaternion));}
  }
  function releaseCloth(state:MeshState) {
    materialList(state.mesh).forEach(mat=>{if(mat instanceof THREE.MeshStandardMaterial && mat.map && !ownedTextures.has(mat.map))mat.map.dispose();mat.dispose();});
    state.mesh.geometry.clearGroups();
  }
  function setOutfit(garments:Garment[],products:ProductListing[],outfitUrl?:string) {
    outfitAbort.abort();outfitAbort=new AbortController();const revision=++outfitRevision;
    clothing.clear();disposeGroup(accessories);accessories.clear();onTextureNotice('');
    renderer.domElement.dataset.textureReady='false';renderer.domElement.dataset.garmentTextures='0';
    const omitted:string[]=[];const bagReferences:Array<{piece:OutfitPiece;group:THREE.Group}>=[];
    const fixtureSelected=demo && isExampleOutfitSelection(garments,products);
    for(const name of exampleMeshNames){const state=meshes.get(name);if(state)state.mesh.visible=fixtureSelected;}
    if(fixtureSelected){
      for(const name of ['top','tank','knit','dressbodice','tights','legwarmers','blouse','jacket','trousers','miniskirt','midiskirt','shoes','hair']){const state=meshes.get(name);if(state)state.mesh.visible=false;}
      renderer.domElement.dataset.exampleFixture=exampleFixtureId;renderer.domElement.dataset.garmentMeshes='example-sweater,example-trousers,example-bag,example-flats';renderer.domElement.dataset.textureReady='true';renderer.domElement.dataset.garmentTextures='0';
      const body=meshes.get('body');
      if(body?.index){const keep:number[]=[];for(let i=0;i<body.index.count;i+=3){const tri=[body.index.getX(i),body.index.getX(i+1),body.index.getX(i+2)];if(!tri.every(v=>coveredByExampleClothing([body.position[v*3],body.position[v*3+1],body.position[v*3+2]],handVertices.has(v))))keep.push(...tri);}body.mesh.geometry.setIndex(keep);}
      deform();updateAccessories();draw();return;
    }
    if(demo)renderer.domElement.dataset.exampleFixture='';
    const names=['top','tank','knit','dressbodice','tights','legwarmers','blouse','jacket','trousers','miniskirt','midiskirt','shoes'];
    for(const name of names){const state=meshes.get(name);if(state)state.mesh.visible=false;}
    const apply=(piece:OutfitPiece)=>{const state=meshes.get(piece.mesh);if(!state)return;const previous=clothing.get(piece.mesh);if(previous && previous.garment.id!==piece.garment.id)omitted.push(`${previous.garment.name} (showing ${piece.garment.name} on the same layer)`);state.mesh.visible=true;state.mesh.receiveShadow=piece.mesh!=='tights';state.mesh.renderOrder=piece.mesh==='tights'?1:0;clothing.set(piece.mesh,piece);releaseCloth(state);state.mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(state.uv.slice(),2));state.mesh.material=patterned(piece.appearance);if(piece.appearance.sheer){const mat=state.mesh.material as THREE.MeshStandardMaterial;mat.transparent=true;mat.opacity=.58;mat.depthWrite=false;}};
    for(const piece of outfitPlan(garments,products)){if(['bag','jewelry','headwear','belt'].includes(piece.mesh)){const group=attachAccessory(piece.appearance);if(piece.mesh==='bag' && group)bagReferences.push({piece,group});}else if(piece.mesh==='other')omitted.push(`${piece.garment.name} (accessory shape unavailable)`);else apply(piece);}
    const baseGarment={id:'studio-base',name:'Studio base layer',category:'top',attributes:{color:['cream']},visible:true,confidence:1,searchQueries:[]} as Garment;
    const base=(mesh:string,color:string)=>apply({mesh,appearance:{template:mesh as GarmentAppearance['template'],color,metalness:0,roughness:.85,pattern:'solid',wide:false,cropped:false},garment:baseGarment});
    if(!['top','tank','knit','dressbodice','blouse','jacket'].some(n=>meshes.get(n)?.mesh.visible))base('tank','#d8cac0');
    if(!['trousers','miniskirt','midiskirt'].some(n=>meshes.get(n)?.mesh.visible))base('miniskirt','#c4b7ad');
    if(!meshes.get('shoes')?.mesh.visible)base('shoes','#332b2b');
    renderer.domElement.dataset.garmentMeshes=Array.from(clothing.keys()).join(',');
    const stockings=meshes.get('tights');if(stockings?.index){const keep:number[]=[];for(let i=0;i<stockings.index.count;i+=3){const tri=[stockings.index.getX(i),stockings.index.getX(i+1),stockings.index.getX(i+2)];if(!clothing.has('legwarmers') || !tri.every(v=>coveredByClothing([stockings.position[v*3],stockings.position[v*3+1],stockings.position[v*3+2]],['legwarmers'])))keep.push(...tri);}stockings.mesh.geometry.setIndex(keep);}
    const body=meshes.get('body');
    if(body?.index){const visible=Array.from(clothing.keys()).filter(n=>n!=='tights');if(clothing.get('midiskirt')?.appearance.long)visible.push('maxiskirt');if(['top','blouse','tank','knit'].some(n=>clothing.get(n)?.appearance.cropped))visible.push('cropped');const index=body.index,keep:number[]=[];for(let i=0;i<index.count;i+=3){const tri=[index.getX(i),index.getX(i+1),index.getX(i+2)];if(!tri.every(v=>coveredByClothing([body.position[v*3],body.position[v*3+1],body.position[v*3+2]],handVertices.has(v)?visible.filter(n=>n!=='knit'):visible)))keep.push(...tri);}body.mesh.geometry.setIndex(keep);}
    deform();updateAccessories();draw();
    const requests=Array.from(clothing.values()).filter(p=>garmentReferenceSource(p.garment,p.product,outfitUrl));
    if(requests.length)onTextureNotice('Loading selected garment photos…');
    let failures=0;
    const bagTasks=bagReferences.map(async ({piece,group})=>{const source=garmentReferenceSource(piece.garment,piece.product,outfitUrl);if(!source)return;try{const reference=await references.reference(source,piece.appearance,outfitAbort.signal);if(disposed || revision!==outfitRevision)return;const texture=new THREE.CanvasTexture(reference.front);texture.colorSpace=THREE.SRGBColorSpace;const panel=new THREE.Mesh(new THREE.PlaneGeometry(.172,.105),new THREE.MeshStandardMaterial({map:texture,roughness:.55,side:THREE.DoubleSide}));panel.position.set(0,.004,.063);group.add(panel);draw();}catch{if(revision===outfitRevision && !outfitAbort.signal.aborted)failures++;}});
    void Promise.all([...bagTasks,...requests.map(async piece=>{
      try {
        const reference=await references.reference(garmentReferenceSource(piece.garment,piece.product,outfitUrl)!,piece.appearance,outfitAbort.signal);
        if(disposed || revision!==outfitRevision)return;
        const state=meshes.get(piece.mesh)!;
        const front=new THREE.CanvasTexture(reference.front),back=new THREE.CanvasTexture(reference.fabric);
        for(const texture of [front,back]){texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}
        back.wrapS=back.wrapT=THREE.RepeatWrapping;back.repeat.set(3,3);
        const material=(map:THREE.Texture)=>new THREE.MeshStandardMaterial({map,color:'#ffffff',roughness:piece.appearance.roughness,metalness:piece.appearance.metalness,side:THREE.DoubleSide,transparent:!!piece.appearance.sheer,opacity:piece.appearance.sheer?.58:1,depthWrite:!piece.appearance.sheer,polygonOffset:!!piece.appearance.sheer,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
        releaseCloth(state);state.mesh.material=[material(front),material(back)];
        const uv=state.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
        const bounds=projectionBounds(piece.appearance.template,piece.appearance.cropped,piece.appearance.long || piece.appearance.dressLength==='maxi');
        if(piece.appearance.template==='dress' && piece.appearance.dressLength==='midi')bounds.y0=.52;
        for(let i=0;i<uv.count;i++){let y=state.position[i*3+1];if(piece.appearance.long && piece.mesh==='midiskirt' && y<.947)y=.16+(y-.52)*(.947-.16)/(.947-.52);uv.setXY(i,...garmentUV([state.position[i*3],y,state.position[i*3+2]],bounds));}uv.needsUpdate=true;
        const index=state.mesh.geometry.index!,normals=state.mesh.geometry.getAttribute('normal');
        const frontIndices:number[]=[],backIndices:number[]=[];for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];const frontFacing=ids.reduce((sum,v)=>sum+normals.getZ(v),0)>0 && !(piece.mesh==='knit' && ids.some(v=>Math.abs(state.position[v*3])>.16));(frontFacing?frontIndices:backIndices).push(...ids);}state.mesh.geometry.setIndex([...frontIndices,...backIndices]);state.mesh.geometry.addGroup(0,frontIndices.length,0);state.mesh.geometry.addGroup(frontIndices.length,backIndices.length,1);
        renderer.domElement.dataset.garmentTextures=String(Number(renderer.domElement.dataset.garmentTextures || 0)+1);
        renderer.shadowMap.needsUpdate=true;draw();
      }catch(error){if(revision===outfitRevision && !outfitAbort.signal.aborted && !(error instanceof DOMException && error.name==='AbortError'))failures++;}
    })]).then(()=>{if(disposed || revision!==outfitRevision)return;renderer.domElement.dataset.textureReady='true';const notice=failures?'Some selected product photos are unavailable. Showing their approximate colors until they can be loaded.':requests.length?'Clothing product photos applied.':'';onTextureNotice([notice,...omitted.map(name=>`Cannot layer ${name}.`)].filter(Boolean).join(' '));});
  }
  try {
    const avatarPath=demo?`/avatar/examples/${exampleFixtureId}/avatar.glb`:'/avatar/studio.glb';
    const response=await fetch(avatarPath,{signal});if(!response.ok)throw new Error('The bundled avatar body is missing.');
    const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),'/avatar/');
    if(disposed || signal.aborted){disposeGroup(gltf.scene);throw new DOMException('Cancelled','AbortError');}
    avatar=gltf.scene;scene.add(avatar);
    avatar.traverse(obj=>{
      if(obj instanceof THREE.Bone){const name=rigBoneName(obj.name);bones.set(name,obj);const p=obj.userData.bindHead as number[];bindHeads.set(name,new THREE.Vector3(...p as [number,number,number]));}
      if(obj instanceof THREE.SkinnedMesh){obj.frustumCulled=false;obj.castShadow=true;obj.receiveShadow=true;meshes.set(obj.name,{mesh:obj,position:new Float32Array((obj.geometry.getAttribute('position') as THREE.BufferAttribute).array),uv:new Float32Array((obj.geometry.getAttribute('uv') as THREE.BufferAttribute).array),index:obj.geometry.index});}
    });
    const bodyState=meshes.get('body');if(bodyState){const joints=bodyState.mesh.geometry.getAttribute('skinIndex'),weights=bodyState.mesh.geometry.getAttribute('skinWeight');for(let i=0;i<joints.count;i++){let handWeight=0;for(let j=0;j<4;j++)if(/^(wrist|finger)/.test(rigBoneName(bodyState.mesh.skeleton.bones[joints.getComponent(i,j)].name)))handWeight+=weights.getComponent(i,j);if(handWeight>.1)handVertices.add(i);}}
    const loader=new THREE.TextureLoader();
    const paths=[['body','skin.jpg'],['hair','hair.png'],['eyes','eyes.png'],['eyebrows','brows.png'],['eyelashes','lashes.png']] as const;
    await Promise.all(paths.map(async([name,path])=>{
      const texture=await loader.loadAsync(`/avatar/textures/${path}`);if(disposed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();ownedTextures.add(texture);
      const mesh=meshes.get(name)!.mesh;materialList(mesh).forEach(m=>m.dispose());
      const options={map:texture,roughness:name==='eyes'?.2:name==='body'?.64:.63,side:name==='body'?THREE.FrontSide:THREE.DoubleSide,alphaTest:['hair','eyebrows','eyelashes'].includes(name)?.42:0};mesh.material=name==='eyes'?new THREE.MeshPhysicalMaterial({...options,clearcoat:.6,clearcoatRoughness:.2}):new THREE.MeshStandardMaterial(options);
    }));
    if(disposed)throw new DOMException('Cancelled','AbortError');
    controls.update();draw();
    return {setProfile,setOutfit,setPose:(pose)=>{currentPose=pose;applyPose();updateAccessories();draw();},view,zoom,snapshot:()=>new Promise((resolve,reject)=>{renderNow();renderer.domElement.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not export the 3D snapshot.')),'image/png');}),dispose};
  } catch(error) {dispose();throw error;}
}
