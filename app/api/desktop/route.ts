import { desktopRelayUrl } from '../../../bin/cloud-desktop.js';
import { createDesktopSession } from '@/lib/cloud';
import { desktopUrl } from '@/lib/backend';
import { readThread, update } from '@/lib/threads';
import { getBackend } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/**
 * Mint a viewing ticket for a thread's machine.
 *
 * Tickets are single use and live sixty seconds, so this is called when the
 * panel opens rather than when a machine is created. A URL minted early is
 * already dead by the time anyone clicks it. Reconnect mints a new ticket; expiry does not close an authenticated socket.
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
    if (getBackend() === 'cloud') {
      const grant = await createDesktopSession(thread.machineId);
      const relay = process.env.MOLA_DESKTOP_RELAY_URL;
      const secret = process.env.MOLA_DESKTOP_RELAY_SECRET;
      if (!relay || !secret) throw new Error('Start Mola Agent with npm start or npx mola-agent to enable the Cloud desktop relay.');
      return Response.json({ session: { relay_url: desktopRelayUrl(grant, relay, secret) } }, {
        headers: { 'cache-control': 'no-store' },
      });
    }
    return Response.json({ url: await desktopUrl(thread.machineId) });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 502 });
  }
}
