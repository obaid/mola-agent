import { getMachine } from '@/lib/backend';
import { readThread, update } from '@/lib/threads';

export const dynamic = 'force-dynamic';

/**
 * "Somebody is watching this machine."
 *
 * Watching the desktop is using the machine. Without this, only tool calls
 * counted as activity, so the idle reaper would stop a machine out from under
 * a person who was sitting there looking at it.
 *
 * Also reports the machine's status, which is what lets the panel reconnect by
 * itself once a stopped machine is running again.
 */
export async function POST(request: Request) {
  const { threadId } = await request.json();
  const thread = threadId ? readThread(threadId) : null;
  if (!thread?.machineId) {
    return Response.json({ status: 'none' });
  }

  update(thread.id, { machineTouchedAt: new Date().toISOString() });

  try {
    const machine = await getMachine(thread.machineId);
    return Response.json({ status: machine.status, machineId: thread.machineId });
  } catch {
    return Response.json({ status: 'unknown', machineId: thread.machineId });
  }
}
