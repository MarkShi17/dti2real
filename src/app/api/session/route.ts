import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, body, COOKIE, json, rateLimit, sameOrigin, session } from '@/lib/api';
import { storage } from '@/lib/storage';
import { garmentSchema, imageIdSchema } from '@/lib/schema';
import { providerStatus } from '@/lib/providers/config';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try { const id = await session(req); const d = await storage.read(id); return json({ state: d.state, products: d.products, images: d.images, renders: Object.values(d.renders), providers: providerStatus() }); } catch(e) { return apiError(e); }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); rateLimit('session-create', 60);
    const old = req.cookies.get(COOKIE)?.value;
    if (old) { try { await storage.read(old); return json({ ready: true, providers: providerStatus() }); } catch {} }
    const id = await storage.create(), res = json({ ready: true, providers: providerStatus() });
    res.cookies.set(COOKIE, id, { httpOnly: true, sameSite: 'strict', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: 86400 });
    return res;
  } catch(e) { return apiError(e); }
}
const stateSchema = z.object({ screenshotId: imageIdSchema.nullable(), personId: imageIdSchema, garments: z.array(garmentSchema).max(16), selected: z.record(z.string().max(80), z.string().max(160)), activeId: z.string().max(80).nullable(), renderId: z.string().uuid().nullable() });
export async function PATCH(req: NextRequest) {
  try { const id = await session(req); const state = await body(req, stateSchema); await storage.update(id, d => { d.state = state; }); return json({ saved: true }); } catch(e) { return apiError(e); }
}
export async function DELETE(req: NextRequest) {
  try { const id = await session(req); await storage.delete(id); const res = json({ deleted: true }); res.cookies.delete(COOKIE); return res; } catch(e) { return apiError(e); }
}
