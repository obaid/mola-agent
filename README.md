# mola-agent

**Watch an agent use a real computer.**

A chat app that runs on your machine. Ask for something that needs a computer,
and an agent creates a throwaway [Omarchy](https://omarchy.org) desktop, works on
it, and shows you the screen while it does. Take the mouse whenever you want.

```sh
npx mola-core          # local engine
npx mola-agent         # this app
```

It opens a browser, asks which model you want to use, and then you talk to it.

## What it does

The agent has a real Linux machine and sixteen ways to use it. It prefers the
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

## Backends: Local or Cloud

mola-agent supports two backends:

### Local (mola-core)

Run computers on your own hardware:
- Install: `npx mola-core` in a separate terminal
- Free and private
- Limited by your hardware
- No account required

### Cloud (cloud.mola.sh)

Run computers in the cloud:
- Get a token from [cloud.mola.sh](https://cloud.mola.sh)
- Set `MOLA_TOKEN` environment variable
- Choose computer profiles (2c/4g, 4c/8g, etc.)
- Usage tracking and plan limits
- Snapshots and persistent storage

The setup wizard lets you choose. Switch anytime in Settings.

## What you need

**For both backends:**
- Node 20 or newer
- API key for Anthropic, OpenAI or OpenRouter (stored in `~/.mola-agent/config.json`, mode 0600)

**For local backend:**
- The Mola engine: `npx mola-core`
- 4+ GB RAM available for machines

**For cloud backend:**
- `MOLA_TOKEN` from [cloud.mola.sh](https://cloud.mola.sh)

## Already using an agent?

If you have Claude Code, Claude Desktop or Cursor, you may not need this app at
all. The engine ships an MCP server:

```sh
claude mcp add mola -- npx -y mola-core mcp
```

This app exists for the thing MCP cannot do: showing you the desktop beside the
conversation while the agent works.

## Cloud mode

mola-agent supports **cloud.mola.sh** alongside local mola-core. Use persistent
cloud computers instead of throwaway VMs.

### Quick start (cloud)

```sh
# One-time: authenticate
npx mola-cloud login

# Run in cloud mode
export MOLA_BACKEND=cloud
npx mola-agent
```

Or set the token directly:

```sh
export MOLA_TOKEN="sk-..."  # from https://cloud.mola.sh → API tokens
export MOLA_BACKEND=cloud
npx mola-agent
```

### Local vs cloud

| | Local (default) | Cloud |
|---|---|---|
| **Setup** | `npx mola-core` | `npx mola-cloud login` |
| **Environment** | `MOLA_BACKEND=local` (default) | `MOLA_BACKEND=cloud` |
| **Computers** | Throwaway VMs | Persistent (reuse across sessions) |
| **Cost** | Free (local resources) | Usage-based (10h free/month) |
| **Auto-stop** | Manual (idle reaper) | Built-in (30-60 min) |

Conversations work identically in both modes. In cloud mode, each thread gets
its own persistent computer that survives stops and restarts.

See [`docs/cloud-setup.md`](docs/cloud-setup.md) for details.

## How it fits together

### Local mode
```
browser  ─────►  this app's server  ─────►  mola-core :4141  ──►  QEMU
 chat UI          agent loop, tools          REST API            (local VM)
 iframe ──────────────────────────────────►  /desktop
```

### Cloud mode
```
browser  ─────►  this app's server  ─────►  cloud.mola.sh  ──►  QEMU
 chat UI          agent loop, tools          REST API          (cloud VM)
 iframe ──────────────────────────────────►  /desktop/sessions
```

The server is not optional. It holds the model provider key so the browser never
sees it, the cloud API (or engine) sends no CORS headers so the browser could not
call it anyway, and an agent run takes minutes and has to survive a reload.

The iframe is the one thing that talks to the backend directly, because it loads a
document rather than making a request.

## Cloud features

When using cloud backend, you get:

- **Profile selection**: Choose computer size (vCPU, RAM, disk)
- **Snapshots**: Save and restore machine state
- **Usage tracking**: See computers running, compute minutes, storage
- **Billing warnings**: Alerts when approaching plan limits
- **Fleet management**: Start/stop/delete multiple machines
- **Auto-stop**: Machines stop after inactivity to save costs
- **Regions**: View current region (more regions coming)

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

### Environment variables

**Override backend:**
- `MOLA_BACKEND=local` or `MOLA_BACKEND=cloud` (takes precedence over config)

**Cloud:**
- `MOLA_TOKEN` - Cloud API token (required for cloud backend)
- `MOLA_CLOUD_API` - Cloud API URL (default: https://cloud.mola.sh/api/v1)

**Local:**
- `MOLA_API` - Local engine URL
- `MOLA_PORT` - Local engine port (default: 4141)
- `MOLA_HOME` - Local engine state directory

## Implementation details

Three details are worth knowing if you are reading the source:

- **Screenshots are sent at 1024 wide**, because that is what vision models are
  tuned for and it is cheaper every turn. Coordinates coming back are scaled up
  before they reach the machine. Get that wrong and every click lands short.
- **Desktop tickets are single use and live sixty seconds.** They are minted when
  the panel opens, not when a machine is created, and again when a stopped
  machine comes back. Cloud sessions auto-refresh before expiry.
- **Idle machines stop after fifteen minutes.** Each holds 4 GB, so four idle
  conversations is a whole laptop. Disks survive a stop, so nothing is lost.
  Cloud machines can be configured to auto-stop after 30, 60, or 240 minutes.

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
