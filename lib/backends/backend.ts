/**
 * Changes:
 * 2026-09-16: Created backend abstraction interface for local vs cloud compute backends
 */

/**
 * Backend abstraction for compute providers (local mola-core or cloud.mola.sh).
 *
 * This interface allows mola-agent to work with either local VMs or cloud computers
 * without changing the agent logic or UI.
 */

export type ComputerStatus = 'provisioning' | 'booting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface Computer {
  id: string;
  name: string;
  status: ComputerStatus;
  vcpus?: number;
  memory_mb?: number;
  disk_gb?: number;
  created_at?: string;
}

export interface DesktopSession {
  desktop_url: string;
  expires_in: number;
}

export interface ActionResult {
  // Command execution
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  timed_out?: boolean;
  partial_output?: string;
  hint?: string;
  // Screenshot
  mime_type?: string;
  image_base64?: string;
  // Read file
  content_base64?: string;
  // Write file
  written?: string;
  bytes?: number;
  // Click/move
  clicked?: { x: number; y: number };
  moved?: { x: number; y: number };
  // Type/key
  typed?: number;
  pressed?: string;
  // Scroll
  scrolled?: string;
}

export interface HealthStatus {
  ok: boolean;
  detail: string;
  host?: {
    platform: string;
    arch: string;
    accelerator: string | null;
  };
}

/**
 * Backend interface that both local and cloud implementations must satisfy.
 */
export interface ComputerBackend {
  /** Check if backend is reachable and properly configured */
  healthCheck(): Promise<HealthStatus>;

  /** List all computers/machines */
  listComputers(): Promise<Computer[]>;

  /** Get one computer by ID */
  getComputer(id: string): Promise<Computer>;

  /** Create a new computer (may be async, returns when ready) */
  createComputer(spec: { name: string; profile?: string }): Promise<Computer>;

  /** Wait until computer reaches 'ready' status */
  waitForReady(id: string, timeoutMs?: number): Promise<Computer>;

  /** Start a stopped computer */
  startComputer(id: string): Promise<void>;

  /** Stop a running computer */
  stopComputer(id: string): Promise<void>;

  /** Delete a computer and its disk */
  deleteComputer(id: string): Promise<void>;

  /** Create a desktop viewing session */
  createDesktopSession(id: string): Promise<DesktopSession>;

  /** Execute an action (exec, screenshot, click, etc.) */
  executeAction(id: string, action: Record<string, any>): Promise<ActionResult>;
}
