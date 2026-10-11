import { NextRequest, after } from 'next/server';
import { apiError, body, json, session } from '@/lib/api';
import { outfitInputSchema } from '@/lib/schema';
import { queueTryon } from '@/lib/jobs';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  try { const id = await session(req, true); const input = await body(req, outfitInputSchema); const work = await queueTryon(id, input); after(work.run); return json(work.job, work.job.status === 'completed' ? 200 : 202); } catch(e) { return apiError(e); }
}
