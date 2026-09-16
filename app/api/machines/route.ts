import { listMachines, deleteMachine, startMachine, stopMachine } from '@/lib/backend';
import { ownedMachines, listThreads } from '@/lib/threads';

export const dynamic = 'force-dynamic';

/**
 * Every machine the engine has, and which conversation claims it.
 *
 * Machines with no thread were made by hand or through MCP. They are shown, and
 * never touched automatically: a tool that silently destroys computers it did
 * not create is not one to trust. Deleting one is always a person's decision.
 */
export async function GET() {
  try {
    const all = await listMachines();
    const owners = new Map(ownedMachines().map((m) => [m.machineId, m.threadId]));
    const titles = new Map(listThreads().map((t) => [t.id, t.title]));

    const machines = (Array.isArray(all) ? all : []).map((m: any) => {
      const threadId = owners.get(m.id) ?? null;
      return {
        id: m.id,
        name: m.name,
        status: m.status,
        vcpus: m.vcpus,
        memory_mb: m.memory_mb,
        disk_gb: m.disk_gb,
        created_at: m.created_at ?? null,
        threadId,
        threadTitle: threadId ? titles.get(threadId) ?? null : null,
      };
    });

    return Response.json({
      machines,
      // What this is actually costing the host right now.
      runningMemoryMb: machines
        .filter((m) => m.status === 'ready' || m.status === 'booting')
        .reduce((total, m) => total + (m.memory_mb ?? 0), 0),
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 502 });
  }
}

/** Stop or start one machine. */
export async function POST(request: Request) {
  const { id, action } = await request.json() as { id?: string; action?: 'stop' | 'start' };
  if (!id || !action) return Response.json({ error: 'Which machine, and what?' }, { status: 400 });

  try {
    if (action === 'stop') await stopMachine(id);
    else if (action === 'start') await startMachine(id);
    else return Response.json({ error: `No such action: ${action}` }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Which machine?' }, { status: 400 });
  try {
    await deleteMachine(id);
    return Response.json({ deleted: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 502 });
  }
}
