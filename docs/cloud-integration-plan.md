<!--
# Changes:
# 2026-09-16: Initial comprehensive plan for cloud.mola.sh integration
#             Includes architecture, API mapping, implementation plan, risks, and phased rollout
#             Investigates both local mola-core and cloud.mola.sh APIs
#             Proposes backend abstraction pattern with LocalCoreBackend + CloudMolaBackend
-->

# Mola Cloud Integration Plan

**Created:** 2026-09-16  
**Status:** Proposal  
**Goal:** Add cloud.mola.sh support alongside existing local mola-core backend

---

## Executive Summary

This document proposes a clean backend abstraction for mola-agent that enables:
1. **Local mode** (current): mola-core running locally via Docker/native
2. **Cloud mode** (new): persistent cloud computers via https://cloud.mola.sh

The integration preserves the existing local workflow while adding cloud support through a backend selection mechanism (`MOLA_BACKEND=local|cloud`).

---

## 1. Current Architecture

### 1.1 How mola-agent works today

```
Browser UI → Next.js Server → lib/engine.ts → mola-core :4141 → QEMU VM
   (chat)      (agent loop)     (HTTP client)    (REST API)    (Omarchy)
```

**Key files:**
- `lib/engine.ts` - All HTTP calls to mola-core
- `lib/tools.ts` - Agent tools (run_command, screenshot, click, etc.)
- `lib/agent.ts` - Agent setup with tool loop
- `lib/config.ts` - Provider API keys and agent settings
- `app/api/desktop/route.ts` - Mints desktop viewing tickets
- `components/DesktopPanel.tsx` - iframe for live desktop stream

### 1.2 Machine lifecycle (local)

1. **Create**: `POST /v1/machines` → immediate machine object
2. **Wait ready**: Poll `GET /v1/machines/{id}` until `status=ready`
3. **Actions**: `POST /v1/machines/{id}/actions` (exec, read_file, screenshot, click, etc.)
4. **Desktop URL**: `POST /v1/machines/{id}/desktop` → single-use 60s ticket
5. **Stop/Start**: `POST /v1/machines/{id}/stop|start` → immediate status change
6. **Delete**: `DELETE /v1/machines/{id}` → permanent removal

### 1.3 Desktop streaming

- Desktop ticket minted on-demand (60s single-use)
- noVNC viewer loads in iframe
- Heartbeat poll (30s) checks machine status
- Auto-reconnect when machine transitions `stopped` → `ready`

### 1.4 Environment variables (local)

- `MOLA_HOME` - State directory (default: `~/.mola`)
- `MOLA_API` - Engine base URL override
- `MOLA_PORT` - Engine port override (default: 4141)
- `MOLA_AGENT_HOME` - Agent config directory (default: `~/.mola-agent`)

---

## 2. Cloud.mola.sh Capabilities

### 2.1 API surface

**Base URL:** `https://cloud.mola.sh/api/v1`  
**Auth:** Bearer token via `Authorization: Bearer $MOLA_TOKEN`  
**OpenAPI:** https://cloud.mola.sh/openapi.json  
**Docs:** https://cloud.mola.sh/llms-full.txt

### 2.2 Computer lifecycle (cloud)

Key difference: **Lifecycle operations are asynchronous**

1. **Create**: `POST /computers` → `{data: Computer, operation: Operation}`
2. **Poll operation**: `GET /computers/{id}/operations/{op_id}` until `status=completed|failed`
3. **Actions**: `POST /computers/{id}/actions` (same as local)
4. **Desktop session**: `POST /computers/{id}/desktop-sessions` → authenticated URL
5. **Start/Stop**: `POST /computers/{id}/start|stop` → async operation
6. **Delete**: `DELETE /computers/{id}` → async operation (with optional `delete_disk: true`)

### 2.3 API mapping: local ↔ cloud

| Feature | Local (mola-core) | Cloud (cloud.mola.sh) | Mapping notes |
|---------|-------------------|------------------------|---------------|
| Base URL | `http://127.0.0.1:4141` | `https://cloud.mola.sh/api/v1` | Configurable |
| Auth | Operator token from `~/.mola/token` | Bearer token (`MOLA_TOKEN`) | Different credential source |
| Entity name | machines | computers | Rename in code or alias |
| Create | Sync → machine | Async → operation | Must poll operation |
| Start/Stop | Sync | Async → operation | Must poll operation |
| Delete | Sync | Async → operation | Must poll operation |
| Actions | `POST /machines/{id}/actions` | `POST /computers/{id}/actions` | **1:1 compatible** ✅ |
| Desktop URL | `POST /machines/{id}/desktop` | `POST /computers/{id}/desktop-sessions` | Different path & response shape |
| Status polling | `GET /machines/{id}` | `GET /computers/{id}` | Same pattern |
| Scroll action | `up\|down\|left\|right` | `up\|down` only | Cloud subset |
| Button (click) | 1-3 | Not in spec | Assume 1-3 works |

### 2.4 Cloud-specific features

- **Persistence**: Computers survive across sessions (by ID or name)
- **Auto-stop**: 30/60/240 minutes (configurable via `PATCH /computers/{id}`)
- **Profiles**: `small`, etc. (from `GET /profiles`)
- **Images**: Omarchy base (from `GET /images`)
- **Snapshots**: Create/restore/delete disk snapshots
- **SSH**: Account and per-computer SSH keys
- **Regions**: Currently Germany only (migration planned)

---

## 3. Recommended Integration Design

### 3.1 Architecture: Backend abstraction

Introduce a **ComputerBackend interface** with two implementations:

```
┌─────────────────────────────────────────────┐
│          lib/backends/backend.ts            │
│  (ComputerBackend interface)                │
└─────────────────────────────────────────────┘
            ↑                    ↑
            │                    │
┌───────────────────┐   ┌───────────────────┐
│ LocalCoreBackend  │   │ CloudMolaBackend  │
│  (lib/backends/   │   │  (lib/backends/   │
│   local.ts)       │   │   cloud.ts)       │
└───────────────────┘   └───────────────────┘
            ↑                    ↑
            └────────┬───────────┘
                     │
         ┌───────────────────────┐
         │   lib/backends/       │
         │   factory.ts          │
         │  (createBackend())    │
         └───────────────────────┘
                     ↑
                     │
         ┌───────────────────────┐
         │   lib/engine.ts       │
         │  (calls backend via   │
         │   factory)            │
         └───────────────────────┘
```

### 3.2 Backend interface

```typescript
// lib/backends/backend.ts

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
  url: string;
  expires_in: number;
}

export interface ActionResult {
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
}

export interface ComputerBackend {
  /** Check if backend is reachable and configured */
  healthCheck(): Promise<{ ok: boolean; detail: string; host?: any }>;
  
  /** List all computers */
  listComputers(): Promise<Computer[]>;
  
  /** Get one computer by ID */
  getComputer(id: string): Promise<Computer>;
  
  /** Create a new computer (may be async) */
  createComputer(spec: { name: string; profile?: string }): Promise<Computer>;
  
  /** Wait until computer reaches 'ready' status */
  waitForReady(id: string, timeoutMs?: number): Promise<Computer>;
  
  /** Start a stopped computer */
  startComputer(id: string): Promise<void>;
  
  /** Stop a running computer */
  stopComputer(id: string): Promise<void>;
  
  /** Delete a computer */
  deleteComputer(id: string): Promise<void>;
  
  /** Create a desktop viewing session */
  createDesktopSession(id: string): Promise<DesktopSession>;
  
  /** Execute an action (exec, screenshot, click, etc.) */
  executeAction(id: string, action: Record<string, any>): Promise<ActionResult>;
}
```

### 3.3 Configuration selection

**Environment variable:** `MOLA_BACKEND=local|cloud`

```typescript
// lib/backends/factory.ts

export function createBackend(): ComputerBackend {
  const backend = process.env.MOLA_BACKEND || 'local';
  
  switch (backend) {
    case 'local':
      return new LocalCoreBackend();
    case 'cloud':
      return new CloudMolaBackend();
    default:
      throw new Error(`Unknown MOLA_BACKEND: ${backend}`);
  }
}
```

### 3.4 Local implementation (refactor existing)

Move current `lib/engine.ts` logic into `lib/backends/local.ts`:

```typescript
// lib/backends/local.ts

export class LocalCoreBackend implements ComputerBackend {
  private baseUrl(): string {
    return process.env.MOLA_API || 
      `http://127.0.0.1:${process.env.MOLA_PORT || 4141}`;
  }
  
  private token(): string | null {
    const file = join(stateDir(), 'token');
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
  }
  
  async healthCheck() { /* existing engineStatus logic */ }
  async listComputers() { /* existing listMachines logic */ }
  async getComputer(id) { /* existing getMachine logic */ }
  async createComputer(spec) { /* existing createMachine logic */ }
  async waitForReady(id, timeout) { /* existing waitForReady logic */ }
  async startComputer(id) { /* existing startMachine logic */ }
  async stopComputer(id) { /* existing stopMachine logic */ }
  async deleteComputer(id) { /* existing deleteMachine logic */ }
  async createDesktopSession(id) { /* existing desktopUrl logic */ }
  async executeAction(id, action) { /* existing act logic */ }
}
```

### 3.5 Cloud implementation (new)

```typescript
// lib/backends/cloud.ts

export class CloudMolaBackend implements ComputerBackend {
  private baseUrl = 'https://cloud.mola.sh/api/v1';
  
  private token(): string | null {
    return process.env.MOLA_TOKEN || null;
  }
  
  async healthCheck() {
    const token = this.token();
    if (!token) {
      return {
        ok: false,
        detail: 'No MOLA_TOKEN set. Run: npx mola-cloud login',
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
      return {
        ok: true,
        detail: `cloud.mola.sh — ${account.email || 'authenticated'}`,
        host: { platform: 'cloud', arch: 'x86_64', accelerator: 'kvm' },
      };
    } catch {
      return { ok: false, detail: 'Cannot reach cloud.mola.sh' };
    }
  }
  
  async listComputers() {
    const response = await this.call('GET', '/computers');
    return response.data.map(this.normalizeComputer);
  }
  
  async getComputer(id: string) {
    const response = await this.call('GET', `/computers/${id}`);
    return this.normalizeComputer(response.data);
  }
  
  async createComputer(spec: { name: string }) {
    const body = {
      name: spec.name,
      profile: 'small',
      auto_stop_minutes: 60, // Reasonable default
    };
    const response = await this.call('POST', '/computers', body);
    
    // Cloud returns {data: Computer, operation: Operation}
    const operation = response.operation;
    if (operation) {
      await this.waitForOperation(response.data.id, operation.id);
    }
    
    return this.normalizeComputer(response.data);
  }
  
  async waitForReady(id: string, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    let computer;
    
    while (Date.now() < deadline) {
      computer = await this.getComputer(id);
      if (computer.status === 'ready') return computer;
      if (computer.status === 'stopped' || computer.status === 'failed') {
        throw new Error(`Computer reached "${computer.status}" instead of ready`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    throw new Error(`Computer still "${computer.status}" after ${timeoutMs}ms`);
  }
  
  async startComputer(id: string) {
    const response = await this.call('POST', `/computers/${id}/start`);
    if (response.operation) {
      await this.waitForOperation(id, response.operation.id);
    }
  }
  
  async stopComputer(id: string) {
    const response = await this.call('POST', `/computers/${id}/stop`);
    if (response.operation) {
      await this.waitForOperation(id, response.operation.id);
    }
  }
  
  async deleteComputer(id: string) {
    const response = await this.call('DELETE', `/computers/${id}`, { delete_disk: true });
    if (response.operation) {
      await this.waitForOperation(id, response.operation.id);
    }
  }
  
  async createDesktopSession(id: string) {
    const response = await this.call('POST', `/computers/${id}/desktop-sessions`);
    // Cloud returns {data: {url, expires_in}}
    return {
      url: response.data.url,
      expires_in: response.data.expires_in,
    };
  }
  
  async executeAction(id: string, action: Record<string, any>) {
    const response = await this.call('POST', `/computers/${id}/actions`, action);
    return response.data;
  }
  
  // Private helpers
  
  private async call(method: string, path: string, body?: any) {
    const token = this.token();
    if (!token) {
      throw new Error('No MOLA_TOKEN. Run: npx mola-cloud login');
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
      const payload = text ? JSON.parse(text) : {};
      throw new Error(payload.error?.message || `HTTP ${response.status}`);
    }
    
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
  
  private async waitForOperation(computerId: string, operationId: string, timeoutMs = 180_000) {
    const deadline = Date.now() + timeoutMs;
    
    while (Date.now() < deadline) {
      const response = await this.call('GET', `/computers/${computerId}/operations/${operationId}`);
      const op = response.data;
      
      if (op.status === 'completed') return;
      if (op.status === 'failed') {
        throw new Error(op.error_message || 'Operation failed');
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }
    
    throw new Error(`Operation ${operationId} still pending after ${timeoutMs}ms`);
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
    // Cloud: provisioning, ready, stopping, stopped, error
    // Local: booting, ready, stopping, stopped, failed
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
```

### 3.6 Update lib/engine.ts

Keep as a thin facade over the backend:

```typescript
// lib/engine.ts (updated)

import { createBackend } from './backends/factory';

const backend = createBackend();

export const engineStatus = () => backend.healthCheck();
export const listMachines = () => backend.listComputers();
export const getMachine = (id: string) => backend.getComputer(id);
export const createMachine = (spec: any) => backend.createComputer(spec);
export const waitForReady = (id: string, timeout?: number) => backend.waitForReady(id, timeout);
export const startMachine = (id: string) => backend.startComputer(id);
export const stopMachine = (id: string) => backend.stopComputer(id);
export const deleteMachine = (id: string) => backend.deleteComputer(id);
export const desktopUrl = (id: string) => backend.createDesktopSession(id);
export const act = (id: string, action: any) => backend.executeAction(id, action);

// Keep stateDir for backward compat (local backend only)
export { stateDir, operatorToken } from './backends/local';
```

### 3.7 Update lib/tools.ts

Minor changes to handle desktop URL response shape:

```typescript
// In buildTools(), the desktop URL handling:

export const desktopUrl = async (id: string) => {
  const session = await backend.createDesktopSession(id);
  return { desktop_url: session.url, expires_in: session.expires_in };
};
```

Also update `scroll` action to only support `up`/`down` when cloud backend:

```typescript
// In scroll tool:
execute: async ({ direction, amount }) => {
  const id = await ensureMachine(session);
  // Cloud only supports up/down
  if (backend instanceof CloudMolaBackend && (direction === 'left' || direction === 'right')) {
    return { error: 'Cloud backend only supports up/down scroll' };
  }
  await screen(() => act(id, { action: 'scroll', direction, amount: amount ?? 3 }));
  return { scrolled: direction };
}
```

---

## 4. User Experience Design

### 4.1 Backend selection UX

**Option 1: Environment variable (recommended for MVP)**

User sets `MOLA_BACKEND=cloud` before starting mola-agent:

```bash
# Cloud mode
export MOLA_BACKEND=cloud
export MOLA_TOKEN="sk-..."  # or run: npx mola-cloud login
npx mola-agent

# Local mode (default)
npx mola-core  # in another terminal
npx mola-agent
```

**Option 2: Setup wizard enhancement (future)**

Add backend selection to the setup wizard:

```
┌─────────────────────────────────────┐
│ Choose your backend:                │
│                                      │
│ ○ Local (mola-core on this machine) │
│ ● Cloud (cloud.mola.sh)             │
│                                      │
│ [Next]                              │
└─────────────────────────────────────┘
```

**Option 3: Runtime switching (future)**

Add a dropdown in the UI to switch backends (requires session/computer migration planning).

### 4.2 Authentication UX (cloud)

**Preferred flow:**

1. User runs `npx mola-cloud login` (browser OAuth flow)
2. CLI stores token in `~/.mola-cloud/credentials`
3. mola-agent reads token from there or `MOLA_TOKEN` env var

**Alternative (env var only):**

1. User creates token at https://cloud.mola.sh → Account → API tokens
2. User sets `export MOLA_TOKEN="sk-..."`
3. mola-agent uses token directly

### 4.3 Computer reuse vs create-per-session

**Recommendation: Reuse by name**

- **Local mode**: Always creates new throwaway machines (current behavior)
- **Cloud mode**: Reuse computer by thread ID or name, or create if missing

```typescript
// In lib/tools.ts ensureMachine():

async function ensureMachine(session: Session) {
  if (backend instanceof CloudMolaBackend) {
    // Try to find existing computer for this thread
    const existingName = `agent-${threadId}`;
    const computers = await listMachines();
    const existing = computers.find(c => c.name === existingName);
    
    if (existing) {
      if (existing.status === 'stopped') {
        await startMachine(existing.id);
        await waitForReady(existing.id);
      }
      session.machineId = existing.id;
      return existing.id;
    }
    
    // Create new persistent computer
    const machine = await createMachine({ name: existingName });
    // ... rest same as current
  } else {
    // Local: always create throwaway (current logic)
  }
}
```

### 4.4 Desktop streaming URL differences

**Local:** `POST /v1/machines/{id}/desktop` → `{desktop_url, expires_in}`  
**Cloud:** `POST /computers/{id}/desktop-sessions` → `{data: {url, expires_in}}`

Update `app/api/desktop/route.ts`:

```typescript
const session = await desktopUrl(thread.machineId);
// session is now: {desktop_url: string, expires_in: number} (normalized by backend)
return Response.json({ url: session.desktop_url, expires: session.expires_in });
```

---

## 5. Files to Change

### 5.1 New files

| File | Purpose |
|------|---------|
| `lib/backends/backend.ts` | ComputerBackend interface definition |
| `lib/backends/factory.ts` | Backend selection via MOLA_BACKEND env var |
| `lib/backends/local.ts` | LocalCoreBackend implementation (refactored from engine.ts) |
| `lib/backends/cloud.ts` | CloudMolaBackend implementation (new) |
| `docs/cloud-integration-plan.md` | This document |
| `docs/cloud-setup.md` | User guide for cloud mode setup |

### 5.2 Modified files

| File | Change |
|------|--------|
| `lib/engine.ts` | Refactor to thin facade over backend interface |
| `lib/tools.ts` | Handle cloud reuse logic in ensureMachine(); update scroll validation |
| `lib/config.ts` | Add `backend: 'local' \| 'cloud'` to config type |
| `app/api/desktop/route.ts` | Normalize desktop session response shape |
| `app/api/setup/route.ts` | Add cloud backend health check |
| `README.md` | Document cloud mode setup |

### 5.3 No changes needed

- `lib/agent.ts` - Backend abstraction is transparent
- `lib/providers.ts` - Unchanged (LLM provider selection)
- `lib/threads.ts` - Unchanged (disk-based conversation storage)
- `components/*.tsx` - Unchanged (UI)
- `app/api/chat/route.ts` - Unchanged (agent loop)

---

## 6. Phased Rollout

### Phase 1: MVP (First PR) - Backend abstraction + cloud support

**Goal:** Cloud mode works end-to-end for a demo video

**Scope:**
- Implement backend interface
- Refactor local backend
- Implement cloud backend
- Environment variable selection
- Update README with cloud setup

**Test criteria:**
- ✅ Local mode: no regression (all existing tests pass)
- ✅ Cloud mode: create computer, run commands, take screenshots, view desktop
- ✅ Cloud mode: computer reuse across sessions

**Estimated complexity:** ~600-800 LOC (mostly cloud.ts)

### Phase 2: Polish & UX refinements

**Goal:** Production-ready cloud mode

**Scope:**
- Setup wizard backend selection UI
- Better error messages (cloud quota, region unavailable, etc.)
- Cloud-specific features: auto-stop configuration, snapshot support
- Computer naming strategy (per-thread vs shared)
- Desktop session expiry handling (cloud URLs may expire faster)

### Phase 3: Advanced features

**Goal:** Full cloud feature parity

**Scope:**
- Snapshot create/restore tools for agent
- Migration support (region switching)
- SSH access integration
- Usage tracking & cost display
- Multi-computer support (one per thread vs shared pool)

---

## 7. Risks & Mitigations

### 7.1 Async operations

**Risk:** Cloud lifecycle operations return immediately with async operation IDs. Long polling may time out or block UI.

**Mitigation:**
- `waitForOperation()` polls with 2s interval
- 180s timeout (configurable)
- Cloud operations typically complete in 8-30s (per docs)

### 7.2 Desktop URL expiry

**Risk:** Cloud desktop sessions may expire differently than local tickets.

**Mitigation:**
- Already handled: DesktopPanel.tsx polls machine status and auto-reconnects
- Cloud URLs are also short-lived (same pattern)

### 7.3 Concurrent action 409s

**Risk:** Cloud returns 409 if action submitted while another is running.

**Mitigation:**
- Already handled: agent runs actions serially (tool loop)
- Add retry-with-backoff if needed (not MVP)

### 7.4 Auto-stop surprises

**Risk:** Cloud auto-stops idle computers; user confused when machine disappears mid-session.

**Mitigation:**
- Set `auto_stop_minutes: 60` by default (generous)
- Desktop heartbeat extends session (already implemented)
- Agent actions extend session (via cloud API)

### 7.5 Regional availability

**Risk:** Cloud currently runs in Germany only. Latency for non-EU users.

**Mitigation:**
- Document in README
- Future: add region selection (when cloud supports it)

### 7.6 Scroll left/right missing

**Risk:** Cloud only supports `up`/`down` scroll; agent may request `left`/`right`.

**Mitigation:**
- Validate in tool execution; return error if unsupported
- Agent instructions should prefer `up`/`down` anyway

### 7.7 Cost management

**Risk:** Cloud usage accrues cost; local is free.

**Mitigation:**
- Document cloud pricing in README
- Recommend auto-stop configuration
- Future: usage dashboard in UI

---

## 8. Open Questions

1. **Computer lifecycle policy:**
   - Should cloud computers be deleted on thread delete, or only stopped?
   - **Recommendation:** Stop by default, delete only if user confirms (matches desktop paradigm)

2. **Naming strategy:**
   - One computer per thread (`agent-{threadId}`)?
   - Or one shared computer (`mola-agent-default`)?
   - **Recommendation:** Per-thread for isolation (MVP)

3. **Profile selection:**
   - Always use `small` profile?
   - Or expose profile selection in UI?
   - **Recommendation:** Hardcode `small` for MVP, add UI later

4. **Auto-stop default:**
   - 30 min (free tier requirement)?
   - 60 min (more generous)?
   - **Recommendation:** 60 min for paid users, 30 for free (detect via `/account`)

5. **Credential storage:**
   - Read token from `~/.mola-cloud/credentials` (like CLI)?
   - Or require `MOLA_TOKEN` env var?
   - **Recommendation:** Support both (MVP: env var only)

---

## 9. Success Criteria

### 9.1 MVP complete when:

- [ ] User can set `MOLA_BACKEND=cloud` and `MOLA_TOKEN=...`
- [ ] Agent creates persistent cloud computer on first tool use
- [ ] Agent reuses same computer across messages in a thread
- [ ] All agent tools work (exec, read_file, write_file, screenshot, click, type, key, scroll)
- [ ] Desktop panel shows live cloud computer stream
- [ ] Computer stops/starts correctly when agent resumes old thread
- [ ] Local mode still works unchanged (no regression)
- [ ] README documents cloud setup with example commands
- [ ] At least one integration test passes in cloud mode

### 9.2 Production ready when:

- [ ] Setup wizard includes backend selection
- [ ] Cloud errors have helpful messages (quota, auth, region)
- [ ] Usage/cost visible in UI
- [ ] Snapshot tools available to agent
- [ ] Multi-thread computer isolation working

---

## 10. Next Steps

### Immediate (this PR):

1. Create backend interface (`lib/backends/backend.ts`)
2. Implement factory (`lib/backends/factory.ts`)
3. Refactor local backend (`lib/backends/local.ts`)
4. Implement cloud backend (`lib/backends/cloud.ts`)
5. Update `lib/engine.ts` to use backend
6. Test local mode (no regression)
7. Test cloud mode (create, exec, desktop)
8. Update README with cloud setup instructions

### After MVP:

1. Add setup wizard backend selection UI
2. Implement computer management UI (list, stop, delete)
3. Add snapshot tools
4. Add usage/cost tracking
5. Write comprehensive integration tests

---

## 11. Example Usage

### Local mode (existing):

```bash
# Terminal 1
npx mola-core

# Terminal 2
npx mola-agent
```

### Cloud mode (new):

```bash
# One-time setup
npx mola-cloud login

# Run agent
export MOLA_BACKEND=cloud
npx mola-agent

# Or with explicit token
MOLA_BACKEND=cloud MOLA_TOKEN="sk-..." npx mola-agent
```

### Agent conversation (same in both modes):

```
User: Install neovim and show me it running.

Agent: I'll install neovim on the computer and open it.

[creates computer]
[runs: sudo pacman -Syu --noconfirm neovim]
[runs: neovim --version]
[screenshots desktop]

Agent: Neovim 0.10.0 is installed. Opening it now...

[opens terminal]
[types: nvim]
[screenshots]

Agent: Here's Neovim running on the desktop.
```

---

## 12. Appendix: API Comparison Matrix

| Operation | Local API | Cloud API | Notes |
|-----------|-----------|-----------|-------|
| **Create** | `POST /v1/machines` | `POST /v1/computers` | Cloud returns operation |
| **Get** | `GET /v1/machines/{id}` | `GET /v1/computers/{id}` | Same shape |
| **List** | `GET /v1/machines` | `GET /v1/computers` | Same shape |
| **Start** | `POST /v1/machines/{id}/start` | `POST /v1/computers/{id}/start` | Cloud returns operation |
| **Stop** | `POST /v1/machines/{id}/stop` | `POST /v1/computers/{id}/stop` | Cloud returns operation |
| **Delete** | `DELETE /v1/machines/{id}` | `DELETE /v1/computers/{id}` | Cloud returns operation |
| **Desktop** | `POST /v1/machines/{id}/desktop` | `POST /v1/computers/{id}/desktop-sessions` | Different response shape |
| **Actions** | `POST /v1/machines/{id}/actions` | `POST /v1/computers/{id}/actions` | ✅ Identical |

### Action compatibility:

| Action | Local | Cloud | Delta |
|--------|-------|-------|-------|
| exec | ✅ | ✅ | Identical |
| read_file | ✅ | ✅ | Identical |
| write_file | ✅ | ✅ | Identical |
| screenshot | ✅ | ✅ | Identical |
| click | ✅ | ✅ | Identical |
| move | ✅ | ✅ | Identical |
| scroll | up/down/left/right | up/down only | Cloud subset |
| type | ✅ | ✅ | Identical |
| key | ✅ | ✅ | Identical |

---

**Document version:** 1.0  
**Last updated:** 2026-09-16  
**Author:** Cloud Agent  
**Review status:** Awaiting approval
