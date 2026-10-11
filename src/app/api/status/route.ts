import { json } from '@/lib/api';
import { providerReadiness } from '@/lib/providers/readiness';
export const dynamic = 'force-dynamic';
export async function GET() { return json(await providerReadiness()); }
