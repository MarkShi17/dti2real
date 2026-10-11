import { NextRequest } from 'next/server';
import { apiError, json, session } from '@/lib/api';
import { storage } from '@/lib/storage';
import { AppError } from '@/lib/security';
export const runtime = 'nodejs';
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sid = await session(req), { id } = await context.params;
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new AppError('Job not found.', 404);
    const d = await storage.read(sid), job = d.jobs[id];
    if (!job) throw new AppError('Job not found.', 404);
    if (['queued', 'running'].includes(job.status) && Date.now() - job.createdAt > 600000) { job.status = 'failed'; job.error = 'The render was interrupted or timed out. Retry to start a new job.'; await storage.update(sid, s => { s.jobs[id] = job; }); }
    return json(job);
  } catch(e) { return apiError(e); }
}
