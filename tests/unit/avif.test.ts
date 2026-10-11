import { it, expect } from 'vitest';
import sharp from 'sharp';
import { normalizeImage } from '@/lib/images';
it('accepts a still AVIF screenshot and normalizes it to WebP',async()=>{
 const input=await sharp({create:{width:100,height:120,channels:3,background:'#fff'}}).avif().toBuffer();
 const result=await normalizeImage(input);
 expect(result).toMatchObject({width:100,height:120});
 expect((await sharp(result.data).metadata()).format).toBe('webp');
});
