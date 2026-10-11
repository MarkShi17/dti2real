import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { apiError, session } from '@/lib/api';
import { storage, sampleAsset } from '@/lib/storage';
import { AppError, fetchImage } from '@/lib/security';
import { normalizeImage } from '@/lib/images';
export const runtime = 'nodejs';
export async function GET(req: NextRequest, context: {params: Promise<{id:string}>}) {
  try {
    const sid=await session(req), {id}=await context.params, data=await storage.read(sid);
    if(id.length>160 || !Object.hasOwn(data.products,id))throw new AppError('Product not found in this session.',404);
    const product=data.products[id],key=`product-image:${createHash('sha256').update(id+'\n'+product.imageUrl).digest('hex')}`;
    let ref=data.cache[key];
    if(!ref || data.images[ref]?.kind!=='product') {
      const bytes=product.isDemo ? await sampleAsset(product.imageUrl) : await fetchImage(product.imageUrl);
      ref=(await storage.putImage(sid,(await normalizeImage(bytes,1024)).data,'product')).id;
      await storage.update(sid,d=>{d.cache[key]=ref;});
    }
    return new Response(new Uint8Array(await storage.getImage(sid,ref)),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','Cross-Origin-Resource-Policy':'same-origin'}});
  }catch(error){return apiError(error);}
}
