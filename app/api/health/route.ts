import { backendStatus } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  const engine = await backendStatus();
  return Response.json({ ok: true, service: 'mola-agent', engine });
}
