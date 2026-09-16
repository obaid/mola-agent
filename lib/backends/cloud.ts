/**
 * Changes:
 * 2026-09-16: New cloud backend for cloud.mola.sh API
 *             Implements async lifecycle operations, account-based auto-stop, persistent computers
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  ComputerBackend,
  Computer,
  ComputerStatus,
  DesktopSession,
  ActionResult,
  HealthStatus,
} from './backend';

/**
 * Cloud backend for cloud.mola.sh persistent computers.
 *
 * Differences from local:
 * - Lifecycle operations (create/start/stop/delete) are async and return operation IDs to poll
 * - Computers are persistent (survive stops, reuse across sessions)
 * - Auto-stop is built-in (30 or 60 minutes based on plan)
 * - Desktop sessions use /desktop-sessions endpoint
 * - Actions API is nearly identical (scroll only supports up/down)
 */
export class CloudMolaBackend implements ComputerBackend {
  private baseUrl = 'https://cloud.mola.sh/api/v1';

  private token(): string | null {
    // Try MOLA_TOKEN env var first
    if (process.env.MOLA_TOKEN) {
      return process.env.MOLA_TOKEN;
    }

    // Bonus: try reading from CLI credential file (same as npx mola-cloud login stores)
    try {
      const credFile = join(homedir(), '.mola-cloud', 'credentials');
      if (existsSync(credFile)) {
        const content = readFileSync(credFile, 'utf8');
        const match = content.match(/token:\s*([^\s]+)/);
        if (match) return match[1];
      }
    } catch {
      // Ignore errors reading credential file
    }

    return null;
  }

  async healthCheck(): Promise<HealthStatus> {
    const token = this.token();
    if (!token) {
      return {
        ok: false,
        detail: 'No MOLA_TOKEN set. Run: npx mola-cloud login, or export MOLA_TOKEN="sk-..."',
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/account`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 401) {
        return { ok: false, detail: 'Invalid MOLA_TOKEN. Run: npx mola-cloud login' };
      }
      if (!response.ok) {
        return { ok: false, detail: `Cloud API returned ${response.status}` };
      }

      const account = await response.json();
      const email = account.data?.email || account.email || 'authenticated';
      return {
        ok: true,
        detail: `cloud.mola.sh — ${email}`,
        host: { platform: 'cloud', arch: 'x86_64', accelerator: 'kvm' },
      };
    } catch (error: any) {
      if (error?.name === 'TimeoutError') {
        return { ok: false, detail: 'cloud.mola.sh timed out' };
      }
      return { ok: false, detail: 'Cannot reach cloud.mola.sh' };
    }
  }

  async listComputers(): Promise<Computer[]> {
    const response = await this.call('GET', '/computers');
    const data = response.data || [];
    return data.map((raw: any) => this.normalizeComputer(raw));
  }

  async getComputer(id: string): Promise<Computer> {
    const response = await this.call('GET', `/computers/${encodeURIComponent(id)}`);
    return this.normalizeComputer(response.data);
  }

  async createComputer(spec: { name: string }): Promise<Computer> {
    // Detect auto-stop from account plan (free = 30, paid = 60)
    const autoStop = await this.detectAutoStop();

    const body = {
      name: spec.name,
      profile: 'small',
      auto_stop_minutes: autoStop,
    };

    const response = await this.call('POST', '/computers', body);

    // Cloud returns {data: Computer, operation: Operation}
    const computer = response.data;
    const operation = response.operation;

    if (operation) {
      await this.waitForOperation(computer.id, operation.id);
      // Fetch updated computer after operation completes
      return await this.getComputer(computer.id);
    }

    return this.normalizeComputer(computer);
  }

  async waitForReady(id: string, timeoutMs = 120_000): Promise<Computer> {
    const deadline = Date.now() + timeoutMs;
    let computer: Computer;

    while (Date.now() < deadline) {
      computer = await this.getComputer(id);
      if (computer.status === 'ready') return computer;
      if (computer.status === 'stopped' || computer.status === 'failed') {
        throw new Error(`Computer reached "${computer.status}" instead of ready`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    throw new Error(`Computer still not ready after ${timeoutMs / 1000}s`);
  }

  async startComputer(id: string): Promise<void> {
    const response = await this.call('POST', `/computers/${encodeURIComponent(id)}/start`);
    if (response.operation) {
      await this.waitForOperation(id, response.operation.id);
    }
  }

  async stopComputer(id: string): Promise<void> {
    const response = await this.call('POST', `/computers/${encodeURIComponent(id)}/stop`);
    if (response.operation) {
      await this.waitForOperation(id, response.operation.id);
    }
  }

  async deleteComputer(id: string): Promise<void> {
    const body = { delete_disk: true };
    const response = await this.call('DELETE', `/computers/${encodeURIComponent(id)}`, body);
    if (response.operation) {
      await this.waitForOperation(id, response.operation.id);
    }
  }

  async createDesktopSession(id: string): Promise<DesktopSession> {
    const response = await this.call('POST', `/computers/${encodeURIComponent(id)}/desktop-sessions`);
    // Cloud returns {data: {url, expires_in}}
    return {
      desktop_url: response.data.url,
      expires_in: response.data.expires_in,
    };
  }

  async executeAction(id: string, action: Record<string, any>): Promise<ActionResult> {
    // Validate scroll direction for cloud (only up/down supported)
    if (action.action === 'scroll' && action.direction) {
      if (!['up', 'down'].includes(action.direction)) {
        throw new Error(`Cloud backend only supports scroll up/down (got: ${action.direction})`);
      }
    }

    const response = await this.call('POST', `/computers/${encodeURIComponent(id)}/actions`, action);
    return response.data || response;
  }

  // Private helpers

  private async call(method: string, path: string, body?: any): Promise<any> {
    const token = this.token();
    if (!token) {
      throw new Error('No MOLA_TOKEN. Run: npx mola-cloud login, or export MOLA_TOKEN="sk-..."');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(180_000),
    });

    if (!response.ok) {
      const text = await response.text();
      let message = `HTTP ${response.status}`;
      try {
        const payload = text ? JSON.parse(text) : {};
        message = payload.error?.message || payload.message || message;
      } catch {
        // Not JSON or no error field
      }
      throw new Error(message);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  private async waitForOperation(computerId: string, operationId: string, timeoutMs = 180_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const response = await this.call(
        'GET',
        `/computers/${encodeURIComponent(computerId)}/operations/${encodeURIComponent(operationId)}`
      );
      const op = response.data;

      if (op.status === 'completed') return;
      if (op.status === 'failed') {
        throw new Error(op.error_message || 'Operation failed');
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    throw new Error(`Operation ${operationId} still pending after ${timeoutMs / 1000}s`);
  }

  private async detectAutoStop(): Promise<number> {
    try {
      const response = await this.call('GET', '/account');
      const plan = response.data?.plan?.name || response.plan?.name;

      // Free tier requires 30 minutes, paid plans can use 60
      if (plan && plan.toLowerCase() === 'free') {
        return 30;
      }
      return 60;
    } catch {
      // If we can't detect plan, default to 30 (safe for free tier)
      return 30;
    }
  }

  private normalizeComputer(raw: any): Computer {
    return {
      id: raw.id,
      name: raw.name,
      status: this.normalizeStatus(raw.status),
      vcpus: raw.profile?.vcpus || 2,
      memory_mb: raw.profile?.memory_mb || 2048,
      disk_gb: raw.profile?.disk_gb || 20,
      created_at: raw.created_at,
    };
  }

  private normalizeStatus(cloudStatus: string): ComputerStatus {
    const map: Record<string, ComputerStatus> = {
      provisioning: 'booting',
      ready: 'ready',
      stopping: 'stopping',
      stopped: 'stopped',
      error: 'failed',
      failed: 'failed',
    };
    return map[cloudStatus] || 'booting';
  }
}
