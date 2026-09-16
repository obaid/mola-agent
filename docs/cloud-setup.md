<!--
# Changes:
# 2026-09-16: User-facing guide for cloud mode setup
#             Covers authentication, environment variables, cost, troubleshooting
#             Complements the technical cloud-integration-plan.md
-->

# Mola Cloud Setup Guide

Run mola-agent with persistent cloud computers instead of local VMs.

---

## Why Cloud Mode?

**Local mode** (default):
- Runs mola-core locally
- Creates throwaway VMs in Docker/QEMU
- Free, but requires local resources
- Machines deleted when you're done

**Cloud mode**:
- Connects to cloud.mola.sh
- Persistent cloud computers (keep files across sessions)
- No local VM overhead
- Auto-stop when idle
- Billed by usage (free tier: 10h/month)

---

## Quick Start

### 1. Authenticate

```bash
npx mola-cloud login
```

This opens a browser confirmation and saves your credential locally.

### 2. Run mola-agent in cloud mode

```bash
export MOLA_BACKEND=cloud
npx mola-agent
```

That's it! The agent will create and manage cloud computers automatically.

---

## How It Works

### Computer lifecycle

1. **First tool use**: Agent creates a persistent cloud computer for this conversation
2. **Across messages**: Same computer is reused (files persist)
3. **After closing**: Computer auto-stops after 60 minutes of inactivity (configurable)
4. **Next session**: Computer restarts automatically when you resume the thread

### Desktop streaming

The desktop panel shows the live cloud computer screen, just like local mode. Click "Show desktop" when the agent creates a machine.

### Cost

Cloud computers bill by the second:
- **Free tier**: 10 running hours/month, 1 computer
- **Developer**: $20/month, 600 hours included, 3 computers
- **Team**: $99/month, 3000 hours included, 8 computers

See https://cloud.mola.sh/docs/billing for details.

---

## Authentication Options

### Option 1: Interactive login (recommended)

```bash
npx mola-cloud login
export MOLA_BACKEND=cloud
npx mola-agent
```

The CLI stores your credential at `~/.mola-cloud/credentials`.

### Option 2: API token (CI/scripts)

1. Create a token at https://cloud.mola.sh → Account → API tokens
2. Set the token as an environment variable:

```bash
export MOLA_TOKEN="sk-..."
export MOLA_BACKEND=cloud
npx mola-agent
```

**Never commit tokens to git.**

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MOLA_BACKEND` | Yes (for cloud) | `local` | Set to `cloud` to use cloud mode |
| `MOLA_TOKEN` | Optional | (from login) | API token for cloud.mola.sh |

---

## Switching Between Modes

### Local → Cloud

```bash
# Stop local engine (if running)
# pkill -f mola-core

# Start in cloud mode
export MOLA_BACKEND=cloud
npx mola-agent
```

Existing conversations continue with new cloud computers.

### Cloud → Local

```bash
# Start local engine
npx mola-core &

# Start in local mode (default)
unset MOLA_BACKEND
npx mola-agent
```

Cloud computers remain running in your account until you stop them at https://cloud.mola.sh.

---

## Managing Cloud Computers

### View computers

```bash
npx mola-cloud list
```

### Stop a computer

```bash
npx mola-cloud stop <computer-name> --wait
```

Stopped computers keep their files but don't consume running time.

### Delete a computer

```bash
npx mola-cloud delete <computer-name> --yes --wait
```

This permanently removes the computer and its disk.

### SSH access

```bash
npx mola-cloud ssh <computer-name>
```

Connect directly to your cloud computer's terminal.

---

## Troubleshooting

### "No MOLA_TOKEN"

Run `npx mola-cloud login` or set `MOLA_TOKEN` manually.

### "Cannot reach cloud.mola.sh"

Check your internet connection. The cloud API is at https://cloud.mola.sh/api/v1.

### "Computer is not ready"

Cloud computers take 8-30 seconds to boot. The agent waits automatically.

### "Automation conflict (409)"

Another action is still running. The agent retries automatically.

### Desktop won't connect

Desktop URLs expire after use. The panel auto-reconnects; click "Reconnect" if needed.

---

## Limits & Features

### Current limitations

- **Region**: Germany only (more regions coming)
- **Scroll**: Cloud only supports up/down (left/right unsupported)

### Cloud-specific features

- **Snapshots**: Save/restore computer disk states
- **Auto-stop**: Configurable idle timeout (30/60/240 minutes)
- **Persistent disks**: Files survive stops/starts
- **SSH access**: Full terminal access to your computers

---

## Example Session

```bash
# Authenticate
npx mola-cloud login

# Start agent in cloud mode
export MOLA_BACKEND=cloud
npx mola-agent

# In the browser:
User: Install Python and create a Flask app.

# Agent creates cloud computer, installs packages, writes code
# Files persist across messages in this thread

User: Add a /health endpoint.

# Agent reuses same computer, modifies existing code
# Desktop panel shows live browser testing the endpoint

# Close browser
# Computer auto-stops after 60 minutes

# Next day:
# Open browser, resume thread
User: Add Redis caching.

# Agent restarts the same computer (all files still there)
# Work continues where you left off
```

---

## Further Reading

- **Full plan**: [cloud-integration-plan.md](./cloud-integration-plan.md)
- **Cloud API docs**: https://cloud.mola.sh/llms-full.txt
- **OpenAPI spec**: https://cloud.mola.sh/openapi.json
- **Billing & plans**: https://cloud.mola.sh/docs/billing
- **CLI reference**: https://cloud.mola.sh/docs/cli

---

**Questions?** Open an issue at https://github.com/obaid/mola-agent/issues
