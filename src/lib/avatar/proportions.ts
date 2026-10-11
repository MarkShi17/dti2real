import type { AvatarProfile } from './profile';
export type Landmark = { x: number; y: number; z: number; visibility?: number };
export const clampRatio = (v: number) => Math.max(.65, Math.min(1.35, Number.isFinite(v) ? v : 1));
export function profileMatches(p: AvatarProfile, id: string, hash: string, faceId?: string) { return p.referenceId === id && p.sourceHash === hash && p.faceReferenceId === faceId; }
const lerp = (a: number,b: number,t: number) => a+(b-a)*t;
// Meter-space deformation also moves joint anchors. Head size stays fixed; the
// torso and legs move it, avoiding stretched facial features or floating feet.
export function deformPosition([x,y,z]: [number,number,number], p: AvatarProfile['proportions']): [number,number,number] {
  const anchors: [number,number][] = [[0,1],[.55,1],[.88,p.hips],[1.08,p.waist],[1.4,p.shoulder],[1.53,1],[1.9,1]];
  let width = 1;
  for (let i=1;i<anchors.length;i++) if (y<=anchors[i][0]) { const [a,wa]=anchors[i-1], [b,wb]=anchors[i]; width=lerp(wa,wb,Math.max(0,(y-a)/(b-a))); break; }
  const hip=.93, neck=1.53;
  const yy = y <= hip ? y*p.legs : y<=neck ? hip*p.legs+(y-hip)*p.torso : hip*p.legs+(neck-hip)*p.torso+y-neck;
  // Keep limbs slender while translating their attachments with shoulder width.
  const xx = y>1.05 && Math.abs(x)>.24 ? Math.sign(x)*(.24*width+(Math.abs(x)-.24)) : x*width;
  return [xx, yy, z*lerp(1,width,.65)];
}
export function estimateProportions(points: Landmark[], aspect: number, silhouette?: {waistWidth:number; hipWidth:number}): AvatarProfile['proportions'] {
  const neutral = {shoulder:1,waist:1,hips:1,torso:1,legs:1};
  const good = (i:number) => points[i] && (points[i].visibility ?? 1)>.55 && Number.isFinite(points[i].x) && Number.isFinite(points[i].y);
  if (![11,12,23,24].every(good)) return neutral;
  const shoulderY=(points[11].y+points[12].y)/2, hipY=(points[23].y+points[24].y)/2;
  const torso=hipY-shoulderY;
  if (torso<.05) return neutral;
  const shoulder=Math.abs(points[11].x-points[12].x)*aspect;
  const hips=Math.abs(points[23].x-points[24].x)*aspect;
  const shoulderRatio=clampRatio(shoulder/torso/.72);
  // Pose hip landmarks describe joint centers, not the outer silhouette.
  const hipRatio=clampRatio(silhouette ? silhouette.hipWidth*aspect/torso/.65 : hips/torso/.48);
  let legRatio=1, torsoRatio=1;
  if ([27,28].every(good)) {
    const leg=((points[27].y+points[28].y)/2)-hipY;
    if (leg>.08) { const fraction=leg/(leg+torso); legRatio=clampRatio(fraction/.59); torsoRatio=clampRatio((1-fraction)/.41); }
  }
  return {shoulder:shoulderRatio,waist:clampRatio(silhouette ? silhouette.waistWidth*aspect/torso/.5 : hipRatio*.98),hips:hipRatio,torso:torsoRatio,legs:legRatio};
}
export function faceBoundsFromLandmarks(points: Landmark[]): AvatarProfile['faceBounds'] {
  if (points.length!==468 && points.length!==478) return undefined;
  if (points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) return undefined;
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const x=Math.max(0,minX-(maxX-minX)*.08), y=Math.max(0,minY-(maxY-minY)*.06);
  return {x,y,w:Math.min(1,maxX+(maxX-minX)*.08)-x,h:Math.min(1,maxY+(maxY-minY)*.06)-y};
}
