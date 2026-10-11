import { expect, it } from 'vitest';
import sharp from 'sharp';
import { poseIdentity } from '@/lib/pose-identity';
it('isolates the upper reference in a full-body photo so original trousers cannot enter a pose edit',async()=>{
  const image=await sharp({create:{width:400,height:800,channels:3,background:'#ffffff'}}).composite([{input:await sharp({create:{width:400,height:400,channels:3,background:'#0000ff'}}).png().toBuffer(),top:400,left:0}]).webp().toBuffer();
  const cropped=await poseIdentity(image);const metadata=await sharp(cropped).metadata();
  expect(metadata.height).toBe(320);expect(metadata.width).toBe(400);
  const {data}=await sharp(cropped).raw().toBuffer({resolveWithObject:true});
  expect(data.every(value=>value>240)).toBe(true);
});
it('uses detected face bounds rather than assuming the face is at the top',async()=>{
 const image=await sharp({create:{width:400,height:800,channels:3,background:'#ffffff'}}).webp().toBuffer();
 const output=await poseIdentity(image,{x:.25,y:.4,w:.3,h:.2});const size=await sharp(output).metadata();
 expect(size.width).toBeLessThan(200);expect(size.height).toBeLessThan(250);
});
it('keeps an already close-up reference intact',async()=>{
 const image=await sharp({create:{width:400,height:400,channels:3,background:'#ffffff'}}).webp().toBuffer();
 expect(await poseIdentity(image)).toEqual(image);
});
