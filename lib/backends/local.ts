/**
 * Changes:
 * 2026-09-16: Refactored from lib/engine.ts to implement ComputerBackend interface
 *             Preserves all existing local mola-core behavior unchanged
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
 * Local backend for mola-core running on localhost.
 *
 * This is a refactoring of the original lib/engine.ts implementation,
 * preserving all existing behavior while conforming to the ComputerBackend interface.
 */
export class LocalCoreBackend implements ComputerBackend {
  private stateDir(): string {
    return process.env.MOLA_HOME || join(homedir(), '.mola');
  }

  private operatorToken(): string | null {
    const file = join(this.stateDir(), 'token');
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
  }

  private engineBase(): string {
    return process.env.MOLA_API || `http://127.0.0.1:${process.env.MOLA_PORT || 4141}`;
  }

  async healthCheck(): Promise<HealthStatus> {
    const token = this.operatorToken();
    if (!token) {
      return {
        ok: false,
        detail: `No token at ${join(this.stateDir(), 'token')}. Start the engine with: npx mola-core`,
      };
    }

    try {
      const response = await fetch(`${this.engineBase()}/v1`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });

      if (response.status === 401) {
        return { ok: false, detail: 'The engine rejected this token. Restart it, or check MOLA_HOME.' };
      }
      if (!response.ok) {
        return { ok: false, detail: `The engine answered ${response.status}.` };
      }

      const info = await response.json();
      const host = info.host ?? {};
      return {
        ok: true,
        detail: `${this.engineBase()} — ${host.platform}/${host.arch}, accelerator ${host.accelerator ?? 'none'}`,
        host: {
          platform: host.platform,
          arch: host.arch,
          accelerator: host.accelerator ?? null,
        },
      };
    } catch {
      return { ok: false, detail: `Nothing answering at ${this.engineBase()}. Start it with: npx mola-core` };
    }
  }

  async listComputers(): Promise<Computer[]> {
    const result = await this.call('GET', '/v1/machines');
    return Array.isArray(result) ? result.map(this.normalizeComputer) : [];
  }

  async getComputer(id: string): Promise<Computer> {
    const result = await this.call('GET', `/v1/machines/${encodeURIComponent(id)}`);
    return this.normalizeComputer(result);
  }

  async createComputer(spec: { name: string }): Promise<Computer> {
    const result = await this.call('POST', '/v1/machines', { name: spec.name });
    return this.normalizeComputer(result);
  }

  async waitForReady(id: string, timeoutMs = 120_000): Promise<Computer> {
    const deadline = Date.now() + timeoutMs;
    let status = 'unknown';
    
    while (Date.now() < deadline) {
      const computer = await this.getComputer(id);
      status = computer.status;
      if (status === 'ready') return computer;
      if (status === 'stopped' || status === 'failed') {
        throw new Error(`The machine reached "${status}" instead of becoming ready.`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    
    throw new Error(`The machine was still "${status}" after ${timeoutMs / 1000}s.`);
  }

  async startComputer(id: string): Promise<void> {
    await this.call('POST', `/v1/machines/${encodeURIComponent(id)}/start`);
  }

  async stopComputer(id: string): Promise<void> {
    await this.call('POST', `/v1/machines/${encodeURIComponent(id)}/stop`);
  }

  async deleteComputer(id: string): Promise<void> {
    await this.call('DELETE', `/v1/machines/${encodeURIComponent(id)}`);
  }

  async createDesktopSession(id: string): Promise<DesktopSession> {
    const result = await this.call('POST', `/v1/machines/${encodeURIComponent(id)}/desktop`);
    return {
      desktop_url: result.desktop_url,
      expires_in: result.expires_in,
    };
  }

  async executeAction(id: string, action: Record<string, any>): Promise<ActionResult> {
    return await this.call('POST', `/v1/machines/${encodeURIComponent(id)}/actions`, action);
  }

  // Private helpers

  private async call(method: string, path: string, body?: unknown, timeoutMs = 180_000): Promise<any> {
    const token = this.operatorToken();
    if (!token) {
      throw new Error('The Mola engine is not running. Start it with: npx mola-core');
    }

    let response: Response;
    try {
      response = await fetch(`${this.engineBase()}${path}`, {
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
        throw new Error(`The engine did not answer within ${timeoutMs / 1000}s.`);
      }
      throw new Error(`No engine at ${this.engineBase()}. Start it with: npx mola-core`);
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    
    if (!response.ok) {
      throw new Error(payload.message ?? `HTTP ${response.status}`);
    }
    
    return payload.data ?? payload;
  }

  private normalizeComputer(raw: any): Computer {
    return {
      id: raw.id,
      name: raw.name,
      status: this.normalizeStatus(raw.status),
      vcpus: raw.vcpus,
      memory_mb: raw.memory_mb,
      disk_gb: raw.disk_gb,
      created_at: raw.created_at,
    };
  }

  private normalizeStatus(status: string): ComputerStatus {
    const map: Record<string, ComputerStatus> = {
      booting: 'booting',
      ready: 'ready',
      stopping: 'stopping',
      stopped: 'stopped',
      failed: 'failed',
    };
    return map[status] || 'booting';
  }
}

// Export helpers for backward compatibility with existing code
export function stateDir(): string {
  return process.env.MOLA_HOME || join(homedir(), '.mola');
}

export function operatorToken(): string | null {
  const file = join(stateDir(), 'token');
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
}
