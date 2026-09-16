# mola-agent

**Watch an agent use a real computer.**

A chat app that runs on your machine. Ask for something that needs a computer,
and an agent creates a throwaway [Omarchy](https://omarchy.org) desktop, works on
it, and shows you the screen while it does. Take the mouse whenever you want.

```sh
npx mola-core          # the engine
npx mola-agent         # this
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

Press **Show desktop** and the live screen slides in beside the conversation.
Your mouse and keyboard work there, so you can take over mid-task and hand back.

## What you need

Node 20 or newer, the Mola engine running, and an API key for Anthropic,
OpenAI or OpenRouter. The key is stored at `~/.mola-agent/config.json` with
mode 0600 and never reaches the browser.

The setup step checks the engine for you rather than asking you to paste a token
you already have on disk.

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

```
browser  ─────►  this app's server  ─────►  engine :4141  ──►  QEMU
 chat UI          agent loop, tools          REST API
 iframe ──────────────────────────────────►  /desktop
```

The server is not optional. It holds the model provider key so the browser never
sees it, the engine sends no CORS headers so the browser could not call it
anyway, and an agent run takes minutes and has to survive a reload.

The iframe is the one thing that talks to the engine directly, because it loads a
document rather than making a request.

Three details are worth knowing if you are reading the source:

- **Screenshots are sent at 1024 wide**, because that is what vision models are
  tuned for and it is cheaper every turn. Coordinates coming back are scaled up
  before they reach the machine. Get that wrong and every click lands short.
- **Desktop tickets are single use and live sixty seconds.** They are minted when
  the panel opens, not when a machine is created, and again when a stopped
  machine comes back.
- **Idle machines stop after fifteen minutes.** Each holds 4 GB, so four idle
  conversations is a whole laptop. Disks survive a stop, so nothing is lost.

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
