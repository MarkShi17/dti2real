import { json } from '@/lib/api';
import { providerStatus } from '@/lib/providers/config';
export const dynamic = 'force-dynamic';
export function GET() { return json(providerStatus()); }
