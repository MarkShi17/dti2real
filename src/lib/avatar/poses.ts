import type { PoseId } from '@/lib/schema';
export type JointRotation = [number, number, number];
// Rig has translation-only bind transforms. Rotations are in its meter-space
// XYZ frame; the upper arm rest direction is already angled down by ~36°.
export function poseRotations(pose: PoseId): Record<string, JointRotation> {
  const r: Record<string,JointRotation> = {
    'upperarm01.L':[0,0,-.7], 'upperarm01.R':[0,0,.7],
    'lowerarm01.L':[-.08,0,0], 'lowerarm01.R':[-.08,0,0],
    'upperleg01.L':[0,0,-.05], 'upperleg01.R':[0,0,.05],
  };
  for (const side of ['L','R']) for (let finger=1;finger<=5;finger++) for(let joint=1;joint<=3;joint++) r[`finger${finger}-${joint}.${side}`]=[finger===1 ? .15 : .12,0,0];
  if(pose==='runway') Object.assign(r, {'root':[0,.04,0], 'upperleg01.L':[-.13,0,-.02], 'upperleg01.R':[.07,0,.025], 'lowerleg01.L':[.12,0,0], 'spine02':[0,0,-.035]});
  if(pose==='hip') Object.assign(r, {'spine03':[0,0,-.065], 'upperarm01.L':[.08,.05,-.35], 'lowerarm01.L':[-1.45,.35,-.6], 'wrist.L':[0,.3,-.25], 'upperleg01.R':[0,0,.025], 'head':[0,-.12,.04]});
  if(pose==='peace') {
    Object.assign(r, {'upperarm01.R':[0,0,.02], 'lowerarm01.R':[0,0,-2.1], 'wrist.R':[0,.15,.12], 'head':[0,.08,-.05], 'spine02':[0,0,.035]});
    for(let joint=1;joint<=3;joint++) {
      r[`finger1-${joint}.R`]=[.55,0,0]; r[`finger2-${joint}.R`]=[0,0,joint===1 ? -.11 : 0];
      r[`finger3-${joint}.R`]=[0,0,joint===1 ? .12 : 0]; r[`finger4-${joint}.R`]=[1.25,0,0]; r[`finger5-${joint}.R`]=[1.35,0,0];
    }
  }
  if(pose==='shoulder') Object.assign(r, {'root':[0,2.35,0], 'spine01':[0,-.5,0], 'head':[0,-1.4,.03], 'upperarm01.L':[-.1,0,-.62], 'upperleg01.L':[-.06,0,.03]});
  if(pose==='lean') Object.assign(r, {'root':[0,0,.06], 'spine03':[0,0,.09], 'head':[0,-.1,-.06], 'upperleg01.L':[.08,0,-.1], 'lowerleg01.L':[.18,0,0], 'upperarm01.L':[0,0,-.6], 'upperarm01.R':[0,0,.5]});
  return r;
}
