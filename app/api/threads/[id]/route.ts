import { clearThread, deleteThread, readThread } from '@/lib/threads';
import { deleteMachine } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = readThread(id);
  if (!thread) return Response.json({ error: 'No such conversation.' }, { status: 404 });
  return Response.json({ thread });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).hostname !== '127.0.0.1' && new URL(origin).hostname !== 'localhost') {
    return new Response('Cross-origin requests are refused.', { status: 403 });
  }
  const { id } = await params;
  const thread = clearThread(id);
  if (!thread) return Response.json({ error: 'No such conversation.' }, { status: 404 });
  return Response.json({ thread });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = readThread(id);
  if (!thread) return Response.json({ error: 'No such conversation.' }, { status: 404 });

  // Deleting a conversation should not silently strand its computer, but it is
  // the caller's choice: the machine may hold work worth keeping.
  const alsoMachine = new URL(request.url).searchParams.get('machine') === 'delete';
  let machineDeleted = false;
  if (alsoMachine && thread.machineId) {
    try { await deleteMachine(thread.machineId); machineDeleted = true; } catch { /* already gone */ }
  }

  deleteThread(id);
  return Response.json({ deleted: true, machineDeleted, machineId: thread.machineId });
}
