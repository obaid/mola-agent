import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { cloudApi, cloudToken } from './cloud-auth.js';

export function readSettings(env = process.env) {
  const file = join(env.MOLA_AGENT_HOME || join(homedir(), '.mola-agent'), 'config.json');
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error('Could not read Mola Agent configuration. Check config.json before retrying.');
  }
}

function saveBackend(backend, env) {
  const dir = env.MOLA_AGENT_HOME || join(homedir(), '.mola-agent');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ approvalSecret: randomBytes(32).toString('base64'), confirmCommands: false, ...readSettings(env), backend }, null, 2) + '\n', { mode: 0o600 });
  chmodSync(file, 0o600);
}

export async function selectBackend({ env = process.env, args = process.argv.slice(2), input = process.stdin, output = process.stdout, ask } = {}) {
  const explicit = args.find((arg) => arg.startsWith('--backend='))?.slice('--backend='.length) || env.MOLA_BACKEND;
  if (explicit && explicit !== 'local' && explicit !== 'cloud') throw new Error('Use --backend=local or --backend=cloud.');
  const saved = readSettings(env).backend;
  let backend = explicit || (!args.includes('--setup') && ['local', 'cloud'].includes(saved) ? saved : null);
  if (!backend && (ask || input.isTTY)) {
    const rl = ask ? null : createInterface({ input, output });
    try {
      output.write('\nWhere should your computer run?\n  1. Local — on this machine\n  2. Cloud — at cloud.mola.sh\n');
      const question = ask || ((prompt) => rl.question(prompt));
      while (!backend) {
        const answer = (await question('Choose [1/2] (default: Local): ')).trim().toLowerCase();
        if (!answer || answer === '1' || answer === 'local') backend = 'local';
        else if (answer === '2' || answer === 'cloud') backend = 'cloud';
        else output.write('Enter 1 for Local or 2 for Cloud.\n');
      }
    } finally { rl?.close(); }
  }
  backend ||= 'local';
  saveBackend(backend, env);
  return backend;
}

export function npmChild(packageName, commandArgs, { env = process.env, stdio = 'inherit', spawnImpl = spawn, detached = false } = {}) {
  return spawnImpl(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', packageName, ...commandArgs], {
    env, stdio, detached, shell: process.platform === 'win32',
  });
}

export function stopOwned(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
  } catch { try { child.kill('SIGTERM'); } catch { /* Already stopped. */ } }
}

export async function probeCore(env = process.env, fetchImpl = fetch) {
  const base = (env.MOLA_API || `http://127.0.0.1:${env.MOLA_PORT || 4141}`).replace(/\/$/, '');
  let token = null;
  try { token = readFileSync(join(env.MOLA_HOME || join(homedir(), '.mola'), 'token'), 'utf8').trim(); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let response;
  try {
    response = await fetchImpl(`${base}/v1`, {
      headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(2000),
    });
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return 'absent';
    throw new Error(`Could not check the existing Core at ${base}. Check MOLA_API/MOLA_PORT before retrying.`);
  }
  if (!response.ok || (await response.json()).service !== 'mola-engine') {
    throw new Error(`Another service or an unavailable Core is answering at ${base}; no second Core was started.`);
  }
  if (!token) throw new Error('Core is running but its token is missing. Check MOLA_HOME before retrying.');
  const auth = await fetchImpl(`${base}/v1/machines`, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2000),
  });
  if (!auth.ok) throw new Error('Core is running but rejected access. Check MOLA_HOME and its token; no second Core was started.');
  return 'ready';
}

export async function ensureLocalCore({ env = process.env, log = console.log, probe = () => probeCore(env), start = () => npmChild('mola-core@^1.5.0', ['start'], { env, detached: process.platform !== 'win32' }), onChild = () => {}, timeoutMs = 30 * 60_000, sleep = delay } = {}) {
  if (await probe() === 'ready') { log('Using your running Mola Core.'); return null; }
  if (env.MOLA_API) throw new Error('The configured MOLA_API is unavailable. Start that Core or unset MOLA_API to use automatic local setup.');
  log('Starting Mola Core. First use may download the guest image and prepare the runtime.');
  const child = start();
  onChild(child);
  let failure = null;
  child.once('error', (error) => { failure = error; });
  const deadline = Date.now() + timeoutMs;
  let nextNote = Date.now() + 10_000;
  try {
    while (Date.now() < deadline) {
      if (failure || child.exitCode !== null || child.signalCode !== null) throw new Error('Mola Core could not start. Check the setup output above; the agent has not launched.');
      if (await probe() === 'ready') { log('Local Core is ready.'); return child; }
      if (Date.now() >= nextNote) { log('Waiting for local Core setup to finish…'); nextNote = Date.now() + 10_000; }
      await sleep(500);
    }
    throw new Error('Core setup did not finish within 30 minutes. Retry npx mola-agent to continue.');
  } catch (error) { stopOwned(child); throw error; }
}

export async function ensureCloud({ env = process.env, interactive = Boolean(process.stdin.isTTY), log = console.log, login = () => npmChild('mola-cloud', ['login'], { env: { ...env, MOLA_API_URL: cloudApi(env) }, detached: process.platform !== 'win32' }), onChild = () => {}, token = () => cloudToken(env), fetchImpl = fetch } = {}) {
  if (!token()) {
    if (!interactive) throw new Error('Cloud needs authentication. Run npx mola-cloud login or set MOLA_TOKEN, then rerun npx mola-agent --backend=cloud.');
    log('Connect your Mola Cloud account in the browser.');
    const child = login();
    onChild(child);
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Cloud login did not complete.')));
    });
  }
  const accessToken = token();
  if (!accessToken) throw new Error('Cloud login completed without saved credentials. Retry npx mola-cloud login.');
  const response = await fetchImpl(`${cloudApi(env)}/account`, {
    headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Cloud connection failed (HTTP ${response.status}). Check MOLA_TOKEN or rerun npx mola-cloud login.`);
  log('Mola Cloud is connected.');
}
