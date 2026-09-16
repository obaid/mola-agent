// Unified backend abstraction - routes to local engine or cloud.mola.sh
// Phase 2: Backend selection implementation

import { readConfig } from './config';
import * as localEngine from './engine';
import * as cloud from './cloud';

export type Backend = 'local' | 'cloud';

export function getBackend(): Backend {
  // MOLA_BACKEND env var takes priority
  const envBackend = process.env.MOLA_BACKEND;
  if (envBackend === 'local' || envBackend === 'cloud') return envBackend;
  
  const config = readConfig();
  return config.backend ?? 'local';
}

// Unified machine representation
export type Machine = {
  id: string;
  name: string;
  status: string;
  vcpus?: number;
  memory_mb?: number;
  disk_gb?: number;
  profile?: string;
  address?: string | null;
  created_at?: string | null;
  auto_stop_minutes?: number | null;
  region?: string;
};

// --- Status checking ---

export async function backendStatus() {
  const backend = getBackend();
  
  if (backend === 'local') {
    const status = await localEngine.engineStatus();
    return {
      backend: 'local' as const,
      ok: status.ok,
      detail: status.detail,
      host: status.host,
    };
  } else {
    const token = cloud.getCloudToken();
    if (!token) {
      return {
        backend: 'cloud' as const,
        ok: false,
        detail: 'MOLA_TOKEN not set. Get one from https://cloud.mola.sh',
      };
    }
    
    try {
      const account = await cloud.getAccount();
      return {
        backend: 'cloud' as const,
        ok: true,
        detail: `${cloud.cloudBase()} — ${account.email ?? 'authenticated'} (${account.plan ?? 'free'})`,
        account,
      };
    } catch (error: any) {
      return {
        backend: 'cloud' as const,
        ok: false,
        detail: error.message ?? 'Cannot reach cloud.mola.sh',
      };
    }
  }
}

// --- Machine operations ---

export async function listMachines(): Promise<Machine[]> {
  const backend = getBackend();
  
  if (backend === 'local') {
    const machines = await localEngine.listMachines();
    return machines.map((m: any) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      vcpus: m.vcpus,
      memory_mb: m.memory_mb,
      disk_gb: m.disk_gb,
      created_at: m.created_at,
    }));
  } else {
    const computers = await cloud.listCloudComputers();
    return computers.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      profile: c.profile,
      address: c.address,
      created_at: c.created_at,
      auto_stop_minutes: c.auto_stop_minutes,
      region: c.region,
    }));
  }
}

export async function getMachine(id: string): Promise<Machine> {
  const backend = getBackend();
  
  if (backend === 'local') {
    const m = await localEngine.getMachine(id);
    return {
      id: m.id,
      name: m.name,
      status: m.status,
      vcpus: m.vcpus,
      memory_mb: m.memory_mb,
      disk_gb: m.disk_gb,
      created_at: m.created_at,
    };
  } else {
    const c = await cloud.getCloudComputer(id);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      profile: c.profile,
      address: c.address,
      created_at: c.created_at,
      auto_stop_minutes: c.auto_stop_minutes,
      region: c.region,
    };
  }
}

export async function createMachine(spec: { name: string; profile?: string }): Promise<Machine> {
  const backend = getBackend();
  
  if (backend === 'local') {
    const m = await localEngine.createMachine({ name: spec.name });
    return {
      id: m.id,
      name: m.name,
      status: m.status,
      vcpus: m.vcpus,
      memory_mb: m.memory_mb,
      disk_gb: m.disk_gb,
    };
  } else {
    const config = readConfig();
    const profile = spec.profile ?? config.cloudProfile ?? 'pilot-2c-4g';
    const result = await cloud.createCloudComputer({
      name: spec.name,
      profile,
      auto_stop_minutes: 60,
    });
    
    // Wait for operation to complete
    if (result.operation?.id) {
      await cloud.waitForOperation(result.data.id, result.operation.id);
    }
    
    const c = result.data;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      profile: c.profile,
      address: c.address,
      auto_stop_minutes: c.auto_stop_minutes,
    };
  }
}

export async function deleteMachine(id: string): Promise<void> {
  const backend = getBackend();
  
  if (backend === 'local') {
    await localEngine.deleteMachine(id);
  } else {
    await cloud.deleteCloudComputer(id);
  }
}

export async function startMachine(id: string): Promise<void> {
  const backend = getBackend();
  
  if (backend === 'local') {
    await localEngine.startMachine(id);
  } else {
    const result = await cloud.startCloudComputer(id);
    if (result.operation?.id) {
      await cloud.waitForOperation(id, result.operation.id);
    }
  }
}

export async function stopMachine(id: string): Promise<void> {
  const backend = getBackend();
  
  if (backend === 'local') {
    await localEngine.stopMachine(id);
  } else {
    const result = await cloud.stopCloudComputer(id);
    if (result.operation?.id) {
      await cloud.waitForOperation(id, result.operation.id);
    }
  }
}

export async function waitForReady(id: string, timeoutMs = 120_000): Promise<Machine> {
  const backend = getBackend();
  
  if (backend === 'local') {
    const m = await localEngine.waitForReady(id, timeoutMs);
    return {
      id: m.id,
      name: m.name,
      status: m.status,
      vcpus: m.vcpus,
      memory_mb: m.memory_mb,
      disk_gb: m.disk_gb,
    };
  } else {
    // Cloud machines should be ready after operation completes
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const machine = await getMachine(id);
      if (machine.status === 'ready' || machine.status === 'running') return machine;
      if (machine.status === 'stopped' || machine.status === 'failed') {
        throw new Error(`Machine reached "${machine.status}" instead of becoming ready`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Machine did not become ready within ${timeoutMs / 1000}s`);
  }
}

// --- Desktop URL ---

export async function desktopUrl(id: string): Promise<string> {
  const backend = getBackend();
  
  if (backend === 'local') {
    const result = await localEngine.desktopUrl(id);
    return result.url;
  } else {
    const session = await cloud.createDesktopSession(id);
    return session.url;
  }
}

// --- Actions ---

export async function act(id: string, action: object): Promise<any> {
  const backend = getBackend();
  
  if (backend === 'local') {
    return localEngine.act(id, action);
  } else {
    return cloud.cloudAct(id, action);
  }
}
