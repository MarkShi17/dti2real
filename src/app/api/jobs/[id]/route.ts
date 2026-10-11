import { NextRequest } from 'next/server';
import { apiError, json, session } from '@/lib/api';
import { storage } from '@/lib/storage';
import { AppError } from '@/lib/security';
import { OUTFIT_JOB_BUDGET_MS } from '@/lib/providers/openai-outfit';
export const runtime = 'nodejs';
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sid = await session(req), { id } = await context.params;
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new AppError('Job not found.', 404);
    const d = await storage.read(sid), job = d.jobs[id];
    if (!job) throw new AppError('Job not found.', 404);
    if (['queued', 'running'].includes(job.status) && Date.now() - job.createdAt >= OUTFIT_JOB_BUDGET_MS) { job.status = 'failed'; job.error = 'The 20-minute render budget expired. A submitted image request may still finish and incur a charge. No automatic retry was sent; your last accepted preview is preserved.'; await storage.update(sid, s => { if (['queued', 'running'].includes(s.jobs[id]?.status)) s.jobs[id] = job; }); }
    return json(job);
  } catch(e) { return apiError(e); }
}
