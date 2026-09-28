#!/usr/bin/env node
/**
 * Start the app and open it.
 *
 * The published package carries a prebuilt standalone server under `server/`.
 * A checkout has no such directory, so this falls back to telling you to build,
 * rather than failing with a missing-file stack trace.
 */
import { randomBytes } from 'node:crypto';
import { startDesktopRelay } from './cloud-desktop.js';
import { cloudApi } from './cloud-auth.js';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectBackend, ensureLocalCore, ensureCloud, stopOwned } from './bootstrap.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const server = join(root, 'server', 'server.js');

const ESC = '[';
const bold = (s) => `${ESC}1m${s}${ESC}0m`;
const dim = (s) => `${ESC}2m${s}${ESC}0m`;
const green = (s) => `${ESC}32m${s}${ESC}0m`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx mola-agent [--setup] [--backend=local|cloud] [--port=3939] [--no-bootstrap]');
  console.log('First run chooses Local or Cloud. Local automatically starts or reuses Mola Core.');
  console.log('Cloud connects with mola-cloud login. Model setup finishes in the browser before chat opens.');
  process.exit(0);
}

if (!existsSync(server)) {
  console.error(`\nNo built server at ${server}.\n`);
  console.error('In a checkout, build it first:\n');
  console.error('  npm install && npm run build && npm run bundle\n');
  process.exit(1);
}

let child = null;
let desktopRelay = null;
let selectedBackend;
let ownedCore = null;
let setupChild = null;
const stop = () => {
  child?.kill('SIGTERM');
  desktopRelay?.close();
  stopOwned(ownedCore);
  stopOwned(setupChild);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  const backend = await selectBackend();
  selectedBackend = backend;
  console.log(`\n  ${bold('Mola Agent')} · ${backend === 'local' ? 'Local' : 'Cloud'} setup`);
  if (!process.argv.includes('--no-bootstrap') && process.env.MOLA_AGENT_BOOTSTRAP !== '0') {
    if (backend === 'local') ownedCore = await ensureLocalCore({ onChild: (process) => { ownedCore = process; } });
    else await ensureCloud({ onChild: (process) => { setupChild = process; } });
  }
  setupChild = null;
} catch (error) {
  stopOwned(ownedCore);
  stopOwned(setupChild);
  console.error(`\nSetup could not finish: ${error.message}\n`);
  process.exit(1);
}

/**
 * Ask the kernel for a free port rather than guessing.
 *
 * Guessing is how two tools end up fighting over 3000, and the engine already
 * learned this lesson the hard way with its runtime port.
 */
function freePort(preferred) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(freePort(0)));
    probe.listen(preferred, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const requested = Number(
  process.env.PORT
  || process.argv.find((a) => a.startsWith('--port='))?.split('=')[1]
  || 3939,
);
const port = await freePort(requested);
const url = `http://127.0.0.1:${port}`;

const desktopSecret = randomBytes(32).toString('hex');
if (selectedBackend === 'cloud') {
  desktopRelay = await startDesktopRelay({ secret: desktopSecret, origin: url, cloudOrigin: new URL(cloudApi()).origin });
}

child = spawn(process.execPath, [server], {
  cwd: join(root, 'server'),
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env,
    PORT: String(port),
    ...(desktopRelay ? { MOLA_DESKTOP_RELAY_URL: desktopRelay.url, MOLA_DESKTOP_RELAY_SECRET: desktopSecret } : {}),
    // Loopback only. This process can create virtual machines and holds a
    // model provider key; it has no business on a shared interface.
    HOSTNAME: '127.0.0.1',
  },
});

console.log(`
${bold('  Mola Agent')} ${dim('· an agent that uses a real computer')}

  ${bold('Open')}  ${green(url)}
${port !== requested ? dim(`  (${requested} was taken)\n`) : ''}
  ${dim('Ctrl-C to stop.')}
`);

// Open the browser once the server is actually answering, so the first paint is
// the app rather than a connection error the user has to reload past.
const opener = process.platform === 'darwin' ? 'open'
  : process.platform === 'win32' ? 'start' : 'xdg-open';

(async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        if (!process.env.MOLA_AGENT_NO_OPEN) {
          spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
        }
        return;
      }
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
})();

child.on('error', (error) => {
  desktopRelay?.close();
  console.error(`Could not launch Mola Agent: ${error.message}`);
  stopOwned(ownedCore);
  process.exit(1);
});
child.on('exit', (code) => {
  desktopRelay?.close();
  stopOwned(ownedCore);
  process.exit(code ?? 0);
});
