import { getBackend, getMachine, listMachines, stopMachine } from './backend';
import { ownedMachines } from './threads';

/**
 * Stop machines nobody is using.
 *
 * Each running machine holds 4 GB of the host by default, so four idle
 * conversations is the whole of a 16 GB laptop. Disks survive a stop, so the
 * thread picks up where it left off and pays the seven seconds again.
 *
 * This is a default rather than a setting, because the failure it prevents
 * (a wedged machine) is much worse than the cost it imposes (a short wait).
 */

const IDLE_MS = 15 * 60 * 1000;
const SWEEP_MS = 60 * 1000;

let timer: NodeJS.Timeout | null = null;

async function sweep() {
  // Cloud computers use their configured server-side auto-stop policy.
  if (getBackend() === 'cloud') return;
  let owned;
  try {
    owned = ownedMachines();
  } catch {
    return;
  }
  if (owned.length === 0) return;

  const now = Date.now();
  for (const { machineId, touchedAt } of owned) {
    const idleFor = now - new Date(touchedAt ?? 0).getTime();
    if (idleFor < IDLE_MS) continue;

    try {
      const machine = await getMachine(machineId);
      if (machine.status !== 'ready' && machine.status !== 'booting') continue;
      await stopMachine(machineId);
      process.stderr.write(`idle ${Math.round(idleFor / 60000)}m: stopped ${machineId}\n`);
    } catch {
      // A machine that has already gone, or an engine that is down, is not an
      // error worth surfacing from a background sweep.
    }
  }
}

export function startReaper() {
  if (timer) return;
  timer = setInterval(() => { void sweep(); }, SWEEP_MS);
  // Never hold the process open for this.
  timer.unref?.();
}

/**
 * Machines the engine has that no thread claims.
 *
 * Reported, never deleted automatically. The operator may well have created
 * them by hand or through MCP, and a tool that silently destroys computers it
 * did not make is not one anybody should trust.
 */
export async function orphans() {
  const mine = new Set(ownedMachines().map((m) => m.machineId));
  const all = await listMachines();
  return (Array.isArray(all) ? all : []).filter((m: any) => !mine.has(m.id));
}
