/**
 * Changes:
 * 2026-09-16: Refactored to use backend abstraction (LocalCoreBackend or CloudMolaBackend)
 *             Preserves existing API surface as thin facade over backend interface
 *             No behavior changes for local mode; adds cloud mode support via MOLA_BACKEND env var
 */

import { createBackend } from './backends/factory';
import { stateDir as localStateDir, operatorToken as localOperatorToken } from './backends/local';

/**
 * Engine facade - delegates to the appropriate backend (local or cloud).
 *
 * This preserves the existing API surface so minimal changes are needed in tools/routes.
 */
const backend = createBackend();

export type EngineStatus = {
  ok: boolean;
  detail: string;
  host?: { platform: string; arch: string; accelerator: string | null };
};

export const engineStatus = () => backend.healthCheck();
export const listMachines = () => backend.listComputers();
export const getMachine = (id: string) => backend.getComputer(id);
export const createMachine = (spec: { name: string }) => backend.createComputer(spec);
export const waitForReady = (id: string, timeoutMs?: number) => backend.waitForReady(id, timeoutMs);
export const startMachine = (id: string) => backend.startComputer(id);
export const stopMachine = (id: string) => backend.stopComputer(id);
export const deleteMachine = (id: string) => backend.deleteComputer(id);
export const act = (id: string, action: object) => backend.executeAction(id, action);

export const desktopUrl = async (id: string) => {
  const session = await backend.createDesktopSession(id);
  return { desktop_url: session.desktop_url, expires_in: session.expires_in };
};

// Re-export local helpers for backward compatibility
export const stateDir = localStateDir;
export const operatorToken = localOperatorToken;
