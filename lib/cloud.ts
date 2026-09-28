// Cloud backend client for cloud.mola.sh API
// Implements Phase 2+3 cloud features: profiles, snapshots, usage, regions

import { readConfig } from './config';
import { cloudApi, cloudToken } from '../bin/cloud-auth.js';

export type Backend = 'local' | 'cloud';

export function getBackend(): Backend {
  // MOLA_BACKEND env var overrides config
  const envBackend = process.env.MOLA_BACKEND;
  if (envBackend === 'local' || envBackend === 'cloud') return envBackend;
  
  const config = readConfig();
  return config.backend ?? 'local';
}

export function getCloudToken(): string | null {
  return cloudToken();
}

export function cloudBase(): string {
  return cloudApi();
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
  retries = 0,
  envelope = false
): Promise<any> {
  const token = getCloudToken();
  if (!token) {
    throw new CloudError(0, 'Cloud login is missing. Run npx mola-cloud login or set MOLA_TOKEN.');
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
    let payload: any;
    try { payload = text ? JSON.parse(text) : {}; }
    catch { throw new CloudError(response.status, `Cloud API returned invalid JSON for ${method} ${path} (HTTP ${response.status}).`); }

    // Handle 409 concurrent automation with retry
    if (response.status === 409 && attemptNum < retries) {
      const backoff = Math.pow(2, attemptNum) * 1000; // 1s, 2s, 4s, 8s
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return attempt(attemptNum + 1);
    }

    if (!response.ok) {
      const message = payload.error?.message ?? payload.message
        ?? (typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`);
      throw new CloudError(response.status, message, payload.error?.code ?? payload.code);
    }

    return envelope ? payload : (payload.data ?? payload);
  };

  return attempt(0);
}

function collection(payload: any, name: string): any[] {
  const rows = Array.isArray(payload) ? payload : payload?.[name];
  if (!Array.isArray(rows)) throw new CloudError(502, `Cloud API returned an invalid ${name} list.`);
  return rows;
}

function computer(payload: any): CloudComputer {
  if (!payload || typeof payload.id !== 'string' || !payload.id || typeof payload.status !== 'string') {
    throw new CloudError(502, 'Cloud API returned an invalid computer (missing id or status).');
  }
  return payload;
}

type ComputerResult = { data: CloudComputer; operation?: { id: string } };

async function lifecycle(method: string, path: string, body: object, retries = 0): Promise<ComputerResult> {
  // Lifecycle responses contain BOTH data and operation. Unwrapping data here
  // loses the operation and made provisioning dereference undefined.data.id.
  const payload = await cloudCall(method, path, body, 30_000, retries, true);
  return { data: computer(payload.data), operation: payload.operation };
}

// --- Account & Usage ---

export type AccountInfo = {
  max_concurrent?: number;
  used_slots?: number;
  max_computers?: number;
  computers_count?: number;
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
  slug: string;
  name: string;
  vcpus: number;
  memory_mb: number;
  disk_gb: number;
  description?: string;
  available: boolean;
};

export const getProfiles = async (): Promise<Profile[]> => {
  const response = await cloudCall('GET', '/profiles');
  return collection(response, 'profiles').map((p) => ({ ...p, id: p.slug ?? p.id, available: p.available ?? true }));
};

// --- Images ---

export type Image = {
  id: string;
  name: string;
  description?: string;
};

export const getImages = async (): Promise<Image[]> => {
  const response = await cloudCall('GET', '/images');
  return collection(response, 'images').map((image) => ({ ...image, id: image.slug ?? image.id }));
};

// --- Computers ---

export type CloudComputer = {
  id: string;
  name: string;
  status: string;
  profile?: { slug: string; name?: string; vcpus?: number; memory_mb?: number; disk_gb?: number };
  address?: string | null;
  auto_stop_minutes?: number | null;
  created_at?: string;
  region?: string;
};

export const listCloudComputers = async (): Promise<CloudComputer[]> => {
  const response = await cloudCall('GET', '/computers');
  return collection(response, 'computers').map(computer);
};

export const getCloudComputer = async (id: string): Promise<CloudComputer> =>
  computer(await cloudCall('GET', `/computers/${encodeURIComponent(id)}`));

export const createCloudComputer = (spec: {
  name: string;
  profile: string;
  image?: string;
  auto_stop_minutes?: number;
}): Promise<ComputerResult> =>
  lifecycle('POST', '/computers', spec);

export const startCloudComputer = (id: string) =>
  lifecycle('POST', `/computers/${encodeURIComponent(id)}/start`, {}, 3);

export const stopCloudComputer = (id: string) =>
  lifecycle('POST', `/computers/${encodeURIComponent(id)}/stop`, {}, 3);

export const restartCloudComputer = (id: string) =>
  lifecycle('POST', `/computers/${encodeURIComponent(id)}/restart`, {}, 3);

export const deleteCloudComputer = (id: string) =>
  cloudCall('DELETE', `/computers/${encodeURIComponent(id)}`, undefined, 30_000, 0);

// --- Desktop Sessions ---

export type DesktopSession = {
  ws_url: string;
  token: string;
  expires_in: number;
};

export const createDesktopSession = async (computerId: string): Promise<DesktopSession> => {
  const response = await cloudCall('POST', `/computers/${encodeURIComponent(computerId)}/desktop-sessions`);
  if (typeof response.ws_url !== 'string' || typeof response.token !== 'string') {
    throw new CloudError(502, 'Cloud API returned an invalid desktop session.');
  }
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
  return collection(response, 'snapshots');
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
  timeoutMs = 180_000
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const op = await getOperation(computerId, operationId);
    if (op.status === 'succeeded' || op.status === 'completed') return op;
    if (op.status === 'failed' || op.status === 'cancelled') {
      throw new CloudError(500, op.error_message ?? 'Operation failed', op.error_code);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new CloudError(504, 'Operation timed out');
}
