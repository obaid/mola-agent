// Cloud backend client for cloud.mola.sh API
// Implements Phase 2+3 cloud features: profiles, snapshots, usage, regions

import { readConfig } from './config';

export type Backend = 'local' | 'cloud';

export function getBackend(): Backend {
  // MOLA_BACKEND env var overrides config
  const envBackend = process.env.MOLA_BACKEND;
  if (envBackend === 'local' || envBackend === 'cloud') return envBackend;
  
  const config = readConfig();
  return config.backend ?? 'local';
}

export function getCloudToken(): string | null {
  return process.env.MOLA_TOKEN ?? null;
}

export function cloudBase(): string {
  return process.env.MOLA_CLOUD_API || 'https://cloud.mola.sh/api/v1';
}

class CloudError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function cloudCall(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 30_000,
  retries = 0
): Promise<any> {
  const token = getCloudToken();
  if (!token) {
    throw new CloudError(0, 'MOLA_TOKEN not set. Get one from https://cloud.mola.sh');
  }

  const attempt = async (attemptNum: number): Promise<any> => {
    let response: Response;
    try {
      response = await fetch(`${cloudBase()}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
    } catch (error: any) {
      if (error?.name === 'TimeoutError') {
        throw new CloudError(504, `Cloud API did not respond within ${timeoutMs / 1000}s`);
      }
      throw new CloudError(0, `Cannot reach ${cloudBase()}: ${error.message}`);
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    // Handle 409 concurrent automation with retry
    if (response.status === 409 && attemptNum < retries) {
      const backoff = Math.pow(2, attemptNum) * 1000; // 1s, 2s, 4s, 8s
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return attempt(attemptNum + 1);
    }

    if (!response.ok) {
      const message = payload.message ?? payload.error ?? `HTTP ${response.status}`;
      throw new CloudError(response.status, message, payload.code);
    }

    return payload.data ?? payload;
  };

  return attempt(0);
}

// --- Account & Usage ---

export type AccountInfo = {
  email?: string;
  plan?: string;
  usage?: {
    computers_running?: number;
    computers_limit?: number;
    compute_minutes_used?: number;
    compute_minutes_limit?: number;
    storage_gb_used?: number;
    storage_gb_limit?: number;
  };
  trial?: {
    active: boolean;
    expires_at?: string;
  };
};

export const getAccount = (): Promise<AccountInfo> => cloudCall('GET', '/account');

// --- Profiles ---

export type Profile = {
  id: string;
  name: string;
  vcpus: number;
  memory_mb: number;
  disk_gb: number;
  description?: string;
  available: boolean;
};

export const getProfiles = async (): Promise<Profile[]> => {
  const response = await cloudCall('GET', '/profiles');
  return response.profiles ?? [];
};

// --- Images ---

export type Image = {
  id: string;
  name: string;
  description?: string;
};

export const getImages = async (): Promise<Image[]> => {
  const response = await cloudCall('GET', '/images');
  return response.images ?? [];
};

// --- Computers ---

export type CloudComputer = {
  id: string;
  name: string;
  status: string;
  profile?: string;
  address?: string | null;
  auto_stop_minutes?: number | null;
  created_at?: string;
  region?: string;
};

export const listCloudComputers = async (): Promise<CloudComputer[]> => {
  const response = await cloudCall('GET', '/computers');
  return response.computers ?? [];
};

export const getCloudComputer = (id: string): Promise<CloudComputer> =>
  cloudCall('GET', `/computers/${encodeURIComponent(id)}`);

export const createCloudComputer = (spec: {
  name: string;
  profile: string;
  image?: string;
  auto_stop_minutes?: number;
}): Promise<{ data: CloudComputer; operation: any }> =>
  cloudCall('POST', '/computers', spec);

export const startCloudComputer = (id: string) =>
  cloudCall('POST', `/computers/${encodeURIComponent(id)}/start`, {}, 30_000, 3);

export const stopCloudComputer = (id: string) =>
  cloudCall('POST', `/computers/${encodeURIComponent(id)}/stop`, {}, 30_000, 3);

export const restartCloudComputer = (id: string) =>
  cloudCall('POST', `/computers/${encodeURIComponent(id)}/restart`, {}, 30_000, 3);

export const deleteCloudComputer = (id: string) =>
  cloudCall('DELETE', `/computers/${encodeURIComponent(id)}`, undefined, 30_000, 0);

// --- Desktop Sessions ---

export type DesktopSession = {
  url: string;
  expires_at: string;
};

export const createDesktopSession = async (computerId: string): Promise<DesktopSession> => {
  const response = await cloudCall('POST', `/computers/${encodeURIComponent(computerId)}/desktop-sessions`);
  return response;
};

// --- Actions (with 409 retry) ---

export const cloudAct = (computerId: string, action: object) =>
  cloudCall('POST', `/computers/${encodeURIComponent(computerId)}/actions`, action, 180_000, 3);

// --- Snapshots ---

export type Snapshot = {
  id: string;
  name: string;
  status: string;
  size_gb?: number;
  created_at: string;
};

export const listSnapshots = async (computerId: string): Promise<Snapshot[]> => {
  const response = await cloudCall('GET', `/computers/${encodeURIComponent(computerId)}/snapshots`);
  return response.snapshots ?? [];
};

export const createSnapshot = (computerId: string, name: string) =>
  cloudCall('POST', `/computers/${encodeURIComponent(computerId)}/snapshots`, { name });

export const deleteSnapshot = (computerId: string, snapshotId: string) =>
  cloudCall('DELETE', `/computers/${encodeURIComponent(computerId)}/snapshots/${encodeURIComponent(snapshotId)}`);

export const restoreSnapshot = (computerId: string, snapshotId: string) =>
  cloudCall('POST', `/computers/${encodeURIComponent(computerId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`);

// --- Operations ---

export const getOperation = (computerId: string, operationId: string) =>
  cloudCall('GET', `/computers/${encodeURIComponent(computerId)}/operations/${encodeURIComponent(operationId)}`);

// --- Usage ---

export const getComputerUsage = async (computerId: string) => {
  return cloudCall('GET', `/computers/${encodeURIComponent(computerId)}/usage`);
};

// --- Wait for operation completion ---

export async function waitForOperation(
  computerId: string,
  operationId: string,
  timeoutMs = 120_000
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const op = await getOperation(computerId, operationId);
    if (op.status === 'completed') return op;
    if (op.status === 'failed') {
      throw new CloudError(500, op.error_message ?? 'Operation failed', op.error_code);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new CloudError(504, 'Operation timed out');
}
