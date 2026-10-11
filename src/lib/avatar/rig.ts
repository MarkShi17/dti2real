import * as THREE from 'three';
import type { PoseId } from '@/lib/schema';
import { poseRotations } from './poses';
// GLTFLoader uses PropertyBinding.sanitizeNodeName, removing joint dots.
export function rigBoneName(name:string){return /\.[LR]$/.test(name) ? name : name.replace(/_?([LR])$/,'.$1');}
function world(bone:THREE.Bone){return bone.getWorldPosition(new THREE.Vector3());}
function point(bone:THREE.Bone){return new THREE.Vector3().fromArray(bone.userData.bindHead as number[]);}
function orient(bone:THREE.Bone,rotation:THREE.Quaternion){
  const parent=bone.parent!.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.clone().invert().multiply(rotation));
}
function solveArm(group:THREE.Object3D,bones:Map<string,THREE.Bone>,side:string,target:THREE.Vector3,hint:THREE.Vector3){
  const upper=bones.get(`upperarm01.${side}`)!,lower=bones.get(`lowerarm01.${side}`)!,wrist=bones.get(`wrist.${side}`)!;
  upper.quaternion.identity();lower.quaternion.identity();wrist.quaternion.identity();group.updateMatrixWorld(true);
  const s=world(upper),e=world(lower),w=world(wrist),a=s.distanceTo(e),b=e.distanceTo(w);
  const direction=target.clone().sub(s),distance=THREE.MathUtils.clamp(direction.length(),Math.abs(a-b)+.001,a+b-.001);direction.normalize();
  const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
  const out=hint.clone().sub(direction.clone().multiplyScalar(hint.dot(direction))).normalize();
  const elbow=s.clone().addScaledVector(direction,along).addScaledVector(out,height),goal=s.clone().addScaledVector(direction,distance);
  const upperRotation=new THREE.Quaternion().setFromUnitVectors(e.clone().sub(s).normalize(),elbow.clone().sub(s).normalize());
  const upperWorld=upper.getWorldQuaternion(new THREE.Quaternion());orient(upper,upperRotation.multiply(upperWorld));group.updateMatrixWorld(true);
  const newE=world(lower),newW=world(wrist),lowerRotation=new THREE.Quaternion().setFromUnitVectors(newW.sub(newE).normalize(),goal.sub(newE).normalize());
  orient(lower,lowerRotation.multiply(lower.getWorldQuaternion(new THREE.Quaternion())));group.updateMatrixWorld(true);
}
function orientHand(group:THREE.Object3D,bones:Map<string,THREE.Bone>,side:string,raised:boolean){
  const wrist=bones.get(`wrist.${side}`)!,middle=bones.get(`finger3-1.${side}`)!,index=bones.get(`finger2-1.${side}`)!,ring=bones.get(`finger4-1.${side}`)!;
  const up=point(middle).sub(point(wrist)).normalize(),right=point(index).sub(point(ring)).normalize(),normal=right.clone().cross(up).normalize();right.copy(up).cross(normal).normalize();
  const rest=new THREE.Matrix4().makeBasis(right,up,normal),target=raised ? new THREE.Matrix4() : new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,1));
  const rotation=new THREE.Quaternion().setFromRotationMatrix(target.multiply(rest.invert()));orient(wrist,rotation);group.updateMatrixWorld(true);
  if(raised)for(let finger=1;finger<=5;finger++)for(let joint=1;joint<=3;joint++){
    const bone=bones.get(`finger${finger}-${joint}.${side}`)!;
    const angle=finger===1?.5:finger===4?joint===3?.7:1.25:finger===5?joint===3?.8:1.35:0;
    bone.quaternion.setFromAxisAngle(right,angle);
    if((finger===2 || finger===3) && joint===1)bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(normal,finger===2?-.15:.15));
  }
}
export function applyRigPose(group:THREE.Object3D,pose:PoseId) {
  const rotations=poseRotations(pose),bones=new Map<string,THREE.Bone>();
  group.traverse(obj=>{if(obj instanceof THREE.Bone){const name=rigBoneName(obj.name),r=rotations[name];bones.set(name,obj);obj.rotation.set(...(r || [0,0,0] as [number,number,number]));}});
  group.updateMatrixWorld(true);
  if(pose==='hip' && bones.has('wrist.L')){
    const hip=world(bones.get('pelvis.L')!);const target=hip.add(new THREE.Vector3(.12,.11,.145));
    solveArm(group,bones,'L',target,new THREE.Vector3(1,0,.15));orientHand(group,bones,'L',false);
  }
  if(pose==='peace' && bones.has('wrist.R')){
    const shoulder=world(bones.get('upperarm01.R')!);const target=shoulder.add(new THREE.Vector3(-.12,.16,.09));
    solveArm(group,bones,'R',target,new THREE.Vector3(-1,-1,0));orientHand(group,bones,'R',true);
  }
  group.updateMatrixWorld(true);
}
// Only covered anatomical surfaces are masked. Joint skinning moves both the
// cloth and this remaining body together. Faces/hands always remain visible.
export function coveredByClothing([x,y,z]:[number,number,number],templates:string[]) {
  if(templates.includes('knit') && y>.89 && y<1.385 && Math.abs(x)<.435 && !(y>1.35 && Math.abs(x)<.08 && z>.10))return true;
  if(templates.some(t=>t==='tank' || t==='dressbodice') && y>(templates.includes('cropped')?1.055:templates.includes('tank')?.889:.945) && y<1.395 && Math.abs(x)<.188){const neck=z>0?1.265+Math.min(Math.abs(x)/.1,1)*.14:1.33+.075;if(y<neck && !(y>1.245 && Math.abs(x)>.158))return true;}
  if(templates.includes('legwarmers') && y>.16 && y<.36)return true;
  const tops=templates.filter(t=>['top','blouse','jacket'].includes(t));
  if(tops.length && y>(templates.includes('cropped')?1.055:.875) && y<1.305 && Math.abs(x)<.145)return true;
  if(tops.length && y>1.14 && y<1.315 && Math.abs(x)<.25)return true;
  if(tops.includes('jacket') && y>.99 && y<1.31 && Math.abs(x)<.43)return true;
  if(templates.includes('trousers') && y>.085 && y<.89)return true;
  if(templates.includes('miniskirt') && y>.69 && y<.9 && Math.abs(x)<.22)return true;
  if(templates.includes('maxiskirt') && y>.17 && y<.945 && Math.abs(x)<.23)return true;
  if(templates.includes('midiskirt') && y>.53 && y<.945 && Math.abs(x)<.22)return true;
  if(templates.includes('shoes') && y<.16)return true;
  return false;
}
