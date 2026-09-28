import { desktopUrl } from '@/lib/backend';
import { readThread, update } from '@/lib/threads';
import { getBackend } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/**
 * Mint a viewing ticket for a thread's machine.
 *
 * Tickets are single use and live sixty seconds, so this is called when the
 * panel opens rather than when a machine is created. A URL minted early is
 * already dead by the time anyone clicks it. Cloud sessions can be refreshed.
 */
export async function POST(request: Request) {
  const { threadId } = await request.json();
  const thread = threadId ? readThread(threadId) : null;
  if (!thread?.machineId) {
    return Response.json({ error: 'This conversation has no machine yet.' }, { status: 409 });
  }
  // Asking to watch counts as using it, or the reaper stops the machine
  // moments after the panel opens.
  update(thread.id, { machineTouchedAt: new Date().toISOString() });

  try {
    const url = await desktopUrl(thread.machineId);
    const backend = getBackend();
    
    // Cloud sessions expire and need refresh; local tickets are single-use
    const needsRefresh = backend === 'cloud';
    
    return Response.json({ 
      url,
      needsRefresh,
      refreshAfter: needsRefresh ? Date.now() + 50_000 : undefined, // Refresh before 60s expiry
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 502 });
  }
}
