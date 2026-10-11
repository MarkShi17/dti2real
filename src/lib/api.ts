import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError } from './security';
import { storage } from './storage';
export const COOKIE = 'dti2irl-session';
const limits = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, max = 40, duration = 60000) {
  const now = Date.now();
  if (limits.size > 2000) for (const [k, v] of limits) if (v.reset < now) limits.delete(k);
  const item = limits.get(key); if (!item || item.reset <= now) { limits.set(key, { count: 1, reset: now + duration }); return; }
  if (++item.count > max) throw new AppError('Too many requests. Wait one minute and try again.', 429);
}
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin) {
    let valid = false;
    try { const parsed = new URL(origin); valid = process.env.PUBLIC_ORIGIN ? parsed.origin === new URL(process.env.PUBLIC_ORIGIN).origin : ['http:', 'https:'].includes(parsed.protocol) && parsed.host === (req.headers.get('host') || new URL(req.url).host); } catch {}
    if (!valid) throw new AppError('Cross-origin requests are not allowed.', 403);
  }
  if (req.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('Cross-site requests are not allowed.', 403);
}
export async function session(req: NextRequest, costly = false) {
  sameOrigin(req); const id = req.cookies.get(COOKIE)?.value;
  if (!id) throw new AppError('Start a session first.', 401);
  await storage.read(id); rateLimit(`${id}:${costly ? 'costly' : 'normal'}`, costly ? 20 : 180); if (costly) rateLimit('global-costly', 120);
  return id;
}
export async function body<S extends z.ZodTypeAny>(req: NextRequest, schema: S): Promise<z.output<S>> {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new AppError('Expected a JSON request.');
  const reader = req.body?.getReader(); if (!reader) throw new AppError('Request body is missing.');
  let text = '', size = 0; const decoder = new TextDecoder();
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 500000) { await reader.cancel(); throw new AppError('Request is too large.', 413); } text += decoder.decode(value, { stream: true }); }
  try { return schema.parse(JSON.parse(text)); } catch { throw new AppError('Invalid request. Check the fields and try again.', 400); }
}
export function apiError(e: unknown) {
  const status = e instanceof AppError ? e.status : 500;
  const message = e instanceof AppError ? e.message : 'The request could not be completed. Please retry.';
  // Never log provider bodies, API tokens, user images or private URLs.
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
export const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
