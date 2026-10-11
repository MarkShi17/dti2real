import { NextRequest } from 'next/server';
import { apiError, session } from '@/lib/api';
import { storage } from '@/lib/storage';
export const runtime = 'nodejs';
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const sid = await session(req); const { id } = await context.params; const image = await storage.getImage(sid, id); return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'Cross-Origin-Resource-Policy': 'same-origin' } }); } catch(e) { return apiError(e); }
}
