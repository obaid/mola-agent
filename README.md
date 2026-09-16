# mola-agent

**Watch an agent use a real Omarchy computer.**

A chat app that gives an agent a real [Omarchy](https://omarchy.org) computer. Run Omarchy locally with `mola-core` or in the cloud with `cloud.mola.sh`. The agent works on it, you see the screen while it does, and you can take the mouse whenever you want.

```sh
npx mola-agent         # this app
npx mola-core          # local engine (or use cloud)
```

Open a browser, pick a model and backend, then talk to it.

## Quick Start

### Local Mode (Default)

Run Omarchy computers on your own hardware:

```sh
npx mola-core          # Terminal 1 - start engine
npx mola-agent         # Terminal 2 - start app
```

- Free and private
- No account required
- Limited by your hardware

### Cloud Mode

Run persistent Omarchy computers on `cloud.mola.sh`:

```sh
# Authenticate once
npx mola-cloud login

# Run with cloud backend
export MOLA_BACKEND=cloud
npx mola-agent
```

Or set the token directly:

```sh
export MOLA_TOKEN="sk-..."  # from https://cloud.mola.sh → API tokens
export MOLA_BACKEND=cloud
npx mola-agent
```

The setup wizard lets you choose. Switch anytime in **Settings** (⚙️ button).

## What it does

The agent has a real Omarchy computer and sixteen ways to use it. It prefers the
shell, because almost everything is faster there, and drives the desktop when the
task is genuinely graphical.

| | |
|---|---|
| Shell | run a command, start a long job and poll it, read and write files |
| Screen | look at it, click, type, press keys, scroll |
| Machines | create, stop, start, delete |
| Snapshots | save and restore machine state (cloud only) |

Press **Show desktop** and the live screen slides in beside the conversation.
Your mouse and keyboard work there, so you can take over mid-task and hand back.

## Local vs Cloud

| | Local | Cloud |
|---|---|---|
| **Setup** | `npx mola-core` | `npx mola-cloud login` |
| **Where** | Omarchy on your machine | Omarchy on cloud.mola.sh |
| **Persistence** | Stops auto-delete after idle | Computers persist, auto-stop when idle |
| **Cost** | Free (your hardware) | Usage-based (10h free/month) |
| **Auto-stop** | 15 minutes idle | 30 min (free) or 60 min (paid) |
| **Snapshots** | No | Yes |
| **Requirements** | 4+ GB RAM per machine | MOLA_TOKEN only |

In cloud mode, each conversation gets its own persistent Omarchy computer (or share one across all conversations — see Config).

## What you need

**For both backends:**
- Node 20 or newer
- API key for Anthropic, OpenAI or OpenRouter (stored in `~/.mola-agent/config.json`, mode 0600)

**For local backend:**
- The Mola engine: `npx mola-core`
- 4+ GB RAM available for machines

**For cloud backend:**
- `MOLA_TOKEN` from [cloud.mola.sh](https://cloud.mola.sh)

## Cloud Features

When using the cloud backend, you get:

- **Backend picker**: Choose local or cloud during setup, or switch in Settings
- **Profile selection**: Pick computer size (2c/4g, 4c/8g, etc.) from wizard or Settings
- **Snapshots**: Save and restore machine state (create, list, restore, delete)
- **Usage display**: See computers running, compute minutes used, plan limits
- **Fleet management**: View, start, stop, delete multiple computers
- **Computer policy**: Per-thread (default) or shared across conversations
- **Auto-stop**: Machines stop after inactivity to save costs (30/60 min)
- **Regions**: Current region displayed (Germany pilot; more coming)
- **Billing warnings**: Alerts at 90% compute minutes or max computers

See [`docs/cloud-setup.md`](docs/cloud-setup.md) for details.

## Already using an agent?

If you have Claude Code, Claude Desktop or Cursor, you may not need this app at
all. The engine ships an MCP server:

```sh
# For local mola-core
claude mcp add mola -- npx -y mola-core mcp

# For cloud.mola.sh
claude mcp add mola-cloud -- npx -y mola-cloud mcp
```

This app exists for the thing MCP cannot do: showing you the desktop beside the
conversation while the agent works.

## Configuration

Config lives at `~/.mola-agent/config.json`:

```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-...",
  "model": "claude-3-5-sonnet-20241022",
  "backend": "cloud",
  "cloudProfile": "pilot-2c-4g",
  "computerPolicy": "per-thread",
  "confirmCommands": false
}
```

### Environment Variables

**Backend selection:**
- `MOLA_BACKEND=local` or `MOLA_BACKEND=cloud` (overrides config)

**Cloud:**
- `MOLA_TOKEN` - Cloud API token (required for cloud backend)
- `MOLA_CLOUD_API` - Cloud API URL (default: https://cloud.mola.sh/api/v1)

**Local:**
- `MOLA_API` - Local engine URL
- `MOLA_PORT` - Local engine port (default: 4141)
- `MOLA_HOME` - Local engine state directory

## How it fits together

### Local mode
```
browser  ─────►  this app's server  ─────►  mola-core :4141  ──►  QEMU
 chat UI          agent loop, tools          REST API         (Omarchy, local)
 iframe ──────────────────────────────────►  /desktop
```

### Cloud mode
```
browser  ─────►  this app's server  ─────►  cloud.mola.sh  ──►  QEMU
 chat UI          agent loop, tools          REST API       (Omarchy, cloud)
 iframe ──────────────────────────────────►  /desktop/sessions
```

The server is not optional. It holds the model provider key so the browser never
sees it, the cloud API (or engine) sends no CORS headers so the browser could not
call it anyway, and an agent run takes minutes and has to survive a reload.

The iframe is the one thing that talks to the backend directly, because it loads a
document rather than making a request.

## Implementation details

Three details are worth knowing if you are reading the source:

- **Screenshots are sent at 1024 wide**, because that is what vision models are
  tuned for and it is cheaper every turn. Coordinates coming back are scaled up
  before they reach the machine. Get that wrong and every click lands short.
- **Desktop tickets are single use and live sixty seconds.** They are minted when
  the panel opens, not when a machine is created, and again when a stopped
  machine comes back. Cloud sessions auto-refresh before expiry.
- **Idle machines stop after 15 minutes locally.** Each holds 4 GB, so four idle
  conversations is a whole laptop. Disks survive a stop, so nothing is lost.
  Cloud machines auto-stop after 30 or 60 minutes depending on plan.

## Working on it

```sh
npm install
npm run dev                                  # http://localhost:3000
npm run build && npm run bundle && npm test
```

`npm test` packs the tarball, installs it, boots it and checks that every asset
the page references resolves. It takes about forty seconds and it is the most
important test here: Next's standalone output fails quietly, serving HTML while
every stylesheet 404s.

## Licence

[FSL-1.1-ALv2](LICENSE.md). Use it for anything except building something that
competes with Mola. Each release becomes Apache 2.0 two years after it ships.
