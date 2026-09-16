import { publicConfig, update, type ProviderId } from '@/lib/config';
import { backendStatus } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ config: publicConfig(), backend: await backendStatus() });
}

export async function POST(request: Request) {
  const body = await request.json() as {
    provider?: ProviderId; 
    apiKey?: string; 
    model?: string; 
    confirmCommands?: boolean;
    backend?: 'local' | 'cloud';
    cloudProfile?: string;
    computerPolicy?: 'per-thread' | 'shared';
  };
  update(body);
  return Response.json({ config: publicConfig() });
}
