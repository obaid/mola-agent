import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { freePort } from './free-port.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const enabled = process.platform !== 'win32' && existsSync(join(root, 'server/server.js'));
const quote = text => `'${text.replaceAll("'", `'\\''`)}'`;

async function fixture(t) {
  const scratch = mkdtempSync(join(tmpdir(), 'mola-launcher-'));
  const bin = join(scratch, 'bin');
  mkdirSync(bin);
  const core = join(scratch, 'core');
  mkdirSync(core);
  const script = join(scratch, 'core.mjs');
  writeFileSync(script, `
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
writeFileSync(join(process.env.MOLA_HOME, 'token'), 'fixture-token', { mode: 0o600 });
writeFileSync(join(process.env.MOLA_HOME, 'args.json'), JSON.stringify(process.argv.slice(2)));
const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/v1') response.end(JSON.stringify({service:'mola-engine',host:{platform:'fixture',arch:'fixture'}}));
  else if (request.headers.authorization !== 'Bearer fixture-token') {response.statusCode=401;response.end('{}');}
  else response.end(JSON.stringify({data:[]}));
});
server.listen(Number(process.env.MOLA_PORT), '127.0.0.1');
process.on('SIGTERM', () => {writeFileSync(join(process.env.MOLA_HOME, 'stopped'), 'yes');server.close(() => process.exit(0));});
`);
  writeFileSync(join(bin, 'npx'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)} "$@"\n`, { mode: 0o700 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOLA_AGENT_HOME: join(scratch, 'agent'), MOLA_HOME: core, MOLA_CONFIG_DIR: join(scratch, 'cloud'), MOLA_BACKEND: 'local', MOLA_PORT: String(await freePort()), PORT: String(await freePort()), MOLA_AGENT_NO_OPEN: '1' };
  delete env.MOLA_API;
  delete env.MOLA_AGENT_BOOTSTRAP;
  const children = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
    await delay(200);
    rmSync(scratch, { recursive: true, force: true });
  });
  return { scratch, core, script, env, children };
}

async function until(check, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* still starting */ }
    await delay(100);
  }
  throw Error('launcher fixture did not reach the expected state');
}

function launch(f) {
  const child = spawn(process.execPath, [join(root, 'bin/mola-agent.js')], { env: f.env, stdio: 'ignore' });
  f.children.push(child);
  return child;
}

test('launcher waits for automatically started Core and stops its owned process group', { skip: enabled ? false : 'requires a built server and POSIX process groups', timeout: 30_000 }, async (t) => {
  const f = await fixture(t);
  const launcher = launch(f);
  await until(async () => (await fetch(`http://127.0.0.1:${f.env.PORT}/api/health`, { signal: AbortSignal.timeout(1000) })).ok);
  assert.deepEqual(JSON.parse(readFileSync(join(f.core, 'args.json'))), ['--yes', 'mola-core@^1.5.0', 'start']);
  launcher.kill('SIGTERM');
  await until(() => existsSync(join(f.core, 'stopped')));
});

test('launcher reuses an external Core and leaves it running when Agent exits', { skip: enabled ? false : 'requires a built server and POSIX process groups', timeout: 30_000 }, async (t) => {
  const f = await fixture(t);
  const external = spawn(process.execPath, [f.script], { env: f.env, stdio: 'ignore' });
  f.children.push(external);
  await until(async () => (await fetch(`http://127.0.0.1:${f.env.MOLA_PORT}/v1`, { signal: AbortSignal.timeout(1000) })).ok);
  const launcher = launch(f);
  await until(async () => (await fetch(`http://127.0.0.1:${f.env.PORT}/api/health`, { signal: AbortSignal.timeout(1000) })).ok);
  launcher.kill('SIGTERM');
  await until(() => launcher.exitCode !== null);
  assert.equal(external.exitCode, null);
  assert.equal(existsSync(join(f.core, 'stopped')), false);
  assert.ok((await fetch(`http://127.0.0.1:${f.env.MOLA_PORT}/v1`)).ok);
});
