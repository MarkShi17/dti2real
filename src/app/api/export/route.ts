import { NextRequest } from 'next/server';
import { z } from 'zod';
import sharp from 'sharp';
import { apiError, body, session } from '@/lib/api';
import { storage } from '@/lib/storage';
import { readRenderImage } from '@/lib/jobs';
import { imageIdSchema } from '@/lib/schema';
import { AppError, safeExternalUrl } from '@/lib/security';
import { POSES } from '@/lib/fixtures';
export const runtime = 'nodejs';
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
export async function POST(req: NextRequest) {
  try {
    const sid = await session(req, true), input = await body(req, z.object({ screenshotId: imageIdSchema, renderId: z.string().uuid(), format: z.enum(['svg', 'png']).default('svg') }));
    const data = await storage.read(sid), render = data.renders[input.renderId];
    if (!render) throw new AppError('Choose a completed preview before exporting.');
    const products = render.productIds.map(id => data.products[id]).filter(Boolean);
    const [original, result] = await Promise.all([
      sharp(await storage.getImage(sid, input.screenshotId)).resize(536, 740, { fit: 'contain', background: '#ddd4df' }).png().toBuffer(),
      sharp(await readRenderImage(sid, render)).resize(536, 740, { fit: 'contain', background: '#dedbd4' }).png().toBuffer()
    ]);
    const height = 1100 + Math.ceil(products.length / 2) * 95;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
    <rect width="1200" height="${height}" fill="#18171b"/><g fill="#f5f0e8" font-family="Arial,sans-serif">
    <text x="44" y="70" font-size="40" font-weight="700">DTI2IRL</text><text x="1156" y="66" text-anchor="end" font-size="19" fill="#f5a6d3">${render.isDemo ? 'SAMPLE PREVIEW · DEMO LISTINGS' : 'AI STYLE VISUALIZATION'}</text>
    <text x="44" y="135" font-family="Georgia,serif" font-size="38">Your DTI fit, IRL.</text>
    <image x="44" y="175" width="536" height="740" href="data:image/png;base64,${original.toString('base64')}"/>
    <image x="620" y="175" width="536" height="740" href="data:image/png;base64,${result.toString('base64')}"/>
    <text x="44" y="950" font-size="22">The inspiration</text><text x="620" y="950" font-size="22">${esc(POSES.find(p => p.id === render.pose)?.name || 'Original pose')}</text>
    <text x="44" y="998" fill="#b3adb8" font-size="16">${esc(render.provider)} · Stylistic preview; not a prediction of size or fit.</text>
    ${products.map((p, i) => { const x = 44 + (i % 2) * 576, y = 1045 + Math.floor(i / 2) * 95; const href = safeExternalUrl(p.productUrl); return `<a ${href ? `href="${esc(href)}" xlink:href="${esc(href)}" target="_blank"` : ''}><text x="${x}" y="${y}" font-size="21">${esc(p.title.slice(0, 44))}</text><text x="${x}" y="${y + 28}" font-size="16" fill="#f5a6d3">${esc(p.isDemo ? 'Demo listing · External shopping search' : `${p.source} · ${new URL(p.productUrl).hostname}`)}</text></a>`; }).join('')}
    <text x="44" y="${height - 25}" font-size="14" fill="#b3adb8">${render.isDemo ? 'Synthetic fictional adult model and outfit samples. Not live listings or personalized generation.' : 'Product links retrieved from provider results. Availability can change. No price guarantees.'}</text></g></svg>`;
    const output = input.format === 'png' ? new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer()) : svg;
    return new Response(output, { headers: { 'Content-Type': input.format === 'png' ? 'image/png' : 'image/svg+xml', 'Content-Disposition': `attachment; filename="dti2irl-${render.pose}.${input.format}"`, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox allow-top-navigation-by-user-activation" } });
  } catch(e) { return apiError(e); }
}
