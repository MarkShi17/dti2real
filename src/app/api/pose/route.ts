import { NextRequest, after } from 'next/server';
import { apiError, body, json, session } from '@/lib/api';
import { poseInputSchema } from '@/lib/schema';
import { queuePose } from '@/lib/jobs';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  try { const id = await session(req, true); const { renderId, pose } = await body(req, poseInputSchema); const work = await queuePose(id, renderId, pose); after(work.run); return json(work.job, work.job.status === 'completed' ? 200 : 202); } catch(e) { return apiError(e); }
}
