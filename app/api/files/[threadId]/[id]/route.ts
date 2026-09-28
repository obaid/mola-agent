import { readArtifact } from '@/lib/artifacts';
import { readThread } from '@/lib/threads';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ threadId: string; id: string }> }) {
  try {
    const { threadId, id } = await context.params;
    if (!readThread(threadId)) return new Response('File not found.', { status: 404 });
    const file = readArtifact(threadId, id);
    return new Response(new Uint8Array(file.data), {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'content-length': String(file.data.length),
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return new Response('File not found.', { status: 404 });
  }
}
