import sharp from 'sharp';
import type { Box } from './schema';
// Local pose edits use facial identity without the old outfit as another wardrobe reference.
export async function poseIdentity(image: Buffer, faceBounds?: Box): Promise<Buffer> {
  const {width,height}=await sharp(image).metadata();
  if(!width || !height)return image;
  if(faceBounds) {
    const cropWidth=Math.min(width,Math.max(64,Math.round(faceBounds.w*width*1.4)));
    const cropHeight=Math.min(height,Math.max(64,Math.round(faceBounds.h*height*1.4)));
    const left=Math.max(0,Math.min(width-cropWidth,Math.round((faceBounds.x-faceBounds.w*.2)*width)));
    const top=Math.max(0,Math.min(height-cropHeight,Math.round((faceBounds.y-faceBounds.h*.2)*height)));
    return sharp(image).extract({left,top,width:cropWidth,height:cropHeight}).webp({quality:95}).toBuffer();
  }
  if(height<width*1.4)return image;
  return sharp(image).extract({left:0,top:0,width,height:Math.max(64,Math.round(height*.4))}).webp({quality:95}).toBuffer();
}
