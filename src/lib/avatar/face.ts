import type { AvatarProfile } from './profile';
type Point = [number,number,number];
type Landmark = {x:number;y:number;z:number};
// Rest-space anatomical anchors for the packaged adult MakeHuman face, in metres.
// MediaPipe indices follow its canonical 468 point face mesh (478 adds irises).
export const FACE_FEATURES:ReadonlyArray<{landmark:number;position:Point}> = [
  {landmark:10,position:[0,1.555,.133]}, {landmark:152,position:[0,1.391,.125]},
  {landmark:234,position:[-.062,1.466,.11]}, {landmark:454,position:[.062,1.466,.11]},
  {landmark:33,position:[-.044,1.500,.119]}, {landmark:133,position:[-.014,1.499,.137]},
  {landmark:362,position:[.014,1.499,.137]}, {landmark:263,position:[.044,1.500,.119]},
  {landmark:168,position:[0,1.502,.142]}, {landmark:1,position:[0,1.470,.159]},
  {landmark:61,position:[-.024,1.438,.134]}, {landmark:291,position:[.024,1.438,.134]},
  {landmark:0,position:[0,1.447,.147]}, {landmark:17,position:[0,1.428,.14]},
  {landmark:172,position:[-.043,1.410,.108]}, {landmark:397,position:[.043,1.410,.108]},
];
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const baseUV=(p:Point):[number,number]=>[(p[0]+.068)/.136,(p[1]-1.389)/.172];
const basis=(a:Point,b:Point)=>Math.exp(-((a[0]-b[0])**2+(a[1]-b[1])**2)/(.023**2));
// Solve a small smooth interpolation field once per reference. Subsequent vertex
// updates retain the original curved mesh, topology, normals and skin weights.
function solve(matrix:number[][],values:number[][]) {
  const rows=matrix.map((row,i)=>[...row,...values[i]]),n=rows.length,m=values[0].length;
  for(let col=0;col<n;col++) {
    let pivot=col;for(let row=col+1;row<n;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const divisor=rows[col][col];for(let j=col;j<n+m;j++)rows[col][j]/=divisor;
    for(let row=0;row<n;row++)if(row!==col){const factor=rows[row][col];for(let j=col;j<n+m;j++)rows[row][j]-=factor*rows[col][j];}
  }
  return rows.map(row=>row.slice(n));
}
export function createFaceMapping(points:Landmark[],bounds:NonNullable<AvatarProfile['faceBounds']>) {
  if(points.length<468 || bounds.w<=0 || bounds.h<=0)return {position:(p:Point):Point=>[...p],uv:baseUV};
  const width=Math.max(.001,Math.abs(points[454].x-points[234].x));
  const height=Math.max(.001,Math.abs(points[152].y-points[10].y));
  const centerX=(points[234].x+points[454].x)/2,centerY=(points[152].y+points[10].y)/2;
  const cheekZ=(points[234].z+points[454].z)/2;
  const values=FACE_FEATURES.map(({landmark,position})=>{
    const point=points[landmark],uv=baseUV(position);
    const targetX=(point.x-centerX)/width*.124,targetY=1.473+(centerY-point.y)/height*.164;
    const depthScale=[1,168].includes(landmark)?.012:[33,133,362,263].includes(landmark)?.004:.006;
    return [clamp(targetX-position[0],-.010,.010),clamp(targetY-position[1],-.008,.008),clamp((cheekZ-point.z)/width*depthScale,-.006,.008),
      (point.x-bounds.x)/bounds.w-uv[0],1-(point.y-bounds.y)/bounds.h-uv[1]];
  });
  const coefficients=solve(FACE_FEATURES.map((a,i)=>FACE_FEATURES.map((b,j)=>basis(a.position,b.position)+(i===j?1e-6:0))),values);
  function displacement(p:Point) {
    const result=[0,0,0,0,0];
    FACE_FEATURES.forEach((anchor,i)=>{const weight=basis(p,anchor.position);for(let j=0;j<5;j++)result[j]+=weight*coefficients[i][j];});
    return result;
  }
  return {
    position:(p:Point):Point=>{
      if(p[1]<1.383 || p[1]>1.570 || Math.abs(p[0])>.075 || p[2]<.075)return [...p];
      const d=displacement(p),edge=clamp((p[1]-1.383)/.008,0,1)*clamp((1.570-p[1])/.012,0,1)*clamp((.075-Math.abs(p[0]))/.01,0,1);
      return [p[0]+clamp(d[0],-.011,.011)*edge,p[1]+clamp(d[1],-.009,.009)*edge,p[2]+clamp(d[2],-.007,.010)*edge];
    },
    uv:(p:Point):[number,number]=>{const uv=baseUV(p),d=displacement(p);return [clamp(uv[0]+d[3],0,1),clamp(uv[1]+d[4],0,1)];},
  };
}
