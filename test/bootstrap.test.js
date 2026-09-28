import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectBackend, ensureLocalCore, ensureCloud, probeCore, npmChild } from '../bin/bootstrap.js';
import { cloudToken } from '../bin/cloud-auth.js';

const quiet = { write() {} };
function environment(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mola-bootstrap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { MOLA_AGENT_HOME: dir, MOLA_HOME: dir, MOLA_CONFIG_DIR: dir };
}
function child() { return Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill() {} }); }

test('first launch asks, saves a private choice and preserves existing model settings', async (t) => {
  const env = environment(t);
  writeFileSync(join(env.MOLA_AGENT_HOME, 'config.json'), JSON.stringify({ model: 'existing', apiKey: 'fixture-key' }));
  let answers = ['invalid', '2'];
  assert.equal(await selectBackend({ env, args: [], input: {}, output: quiet, ask: async () => answers.shift() }), 'cloud');
  const saved = JSON.parse(readFileSync(join(env.MOLA_AGENT_HOME, 'config.json')));
  assert.equal(saved.model, 'existing');
  assert.equal(saved.apiKey, 'fixture-key');
  assert.equal(saved.backend, 'cloud');
  assert.ok(saved.approvalSecret);
  if (process.platform !== 'win32') assert.equal(statSync(join(env.MOLA_AGENT_HOME, 'config.json')).mode & 0o777, 0o600);
  assert.equal(await selectBackend({ env, args: [], input: {}, output: quiet, ask: async () => { throw Error('must reuse choice'); } }), 'cloud');
  assert.equal(await selectBackend({ env, args: ['--setup'], input: {}, output: quiet, ask: async () => '1' }), 'local');
});

test('explicit backend wins and noninteractive first launch defaults to local', async (t) => {
  const env = environment(t);
  assert.equal(await selectBackend({ env, args: [], input: {}, output: quiet }), 'local');
  assert.equal(await selectBackend({ env: { ...env, MOLA_BACKEND: 'cloud' }, args: [], input: {}, output: quiet }), 'cloud');
  await assert.rejects(selectBackend({ env, args: ['--backend=invalid'], output: quiet }), /local or.*cloud/);
});

test('a running Core is reused without spawning or taking ownership', async () => {
  const result = await ensureLocalCore({ probe: async () => 'ready', start: () => { throw Error('must not spawn'); }, log() {} });
  assert.equal(result, null);
});

test('absent Core starts once and is not considered ready until the probe succeeds', async () => {
  const owned = child();
  let starts = 0, probes = 0, tracked;
  const result = await ensureLocalCore({ env: {}, probe: async () => ++probes < 3 ? 'absent' : 'ready', start: () => { starts++; return owned; }, onChild: c => { tracked = c; }, sleep: async () => {}, log() {} });
  assert.equal(starts, 1);
  assert.equal(probes, 3);
  assert.equal(result, owned);
  assert.equal(tracked, owned);
});

test('Core startup failures prevent launching and custom endpoints are never spawned locally', async () => {
  await assert.rejects(ensureLocalCore({ env: {}, probe: async () => 'absent', start: () => Object.assign(child(), { exitCode: 1 }), log() {} }), /could not start/);
  await assert.rejects(ensureLocalCore({ env: { MOLA_API: 'http://127.0.0.1:4999' }, probe: async () => 'absent', start: () => { throw Error('must not spawn'); }, log() {} }), /configured MOLA_API/);
});

test('Core probes reject another service and verify existing token access', async (t) => {
  const env = environment(t);
  writeFileSync(join(env.MOLA_HOME, 'token'), 'fixture-core-token');
  await assert.rejects(probeCore(env, async () => Response.json({ service: 'other' })), /Another service/);
  const calls = [];
  assert.equal(await probeCore(env, async (url, init) => {
    calls.push(url);
    assert.equal(init.headers.authorization, 'Bearer fixture-core-token');
    return Response.json(url.endsWith('/v1') ? { service: 'mola-engine' } : { data: [] });
  }), 'ready');
  assert.equal(calls.length, 2);
});

test('Cloud uses private per-API CLI credentials and does not start Core', async (t) => {
  const env = environment(t);
  writeFileSync(join(env.MOLA_CONFIG_DIR, 'credentials.json'), JSON.stringify({ 'https://cloud.mola.sh/api/v1': { access_token: 'fixture-cloud-token' }, 'https://another.example/api/v1': { access_token: 'wrong-token' } }), { mode: 0o600 });
  assert.equal(cloudToken(env), 'fixture-cloud-token');
  await ensureCloud({ env, interactive: false, log() {}, login: () => { throw Error('must not login'); }, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://cloud.mola.sh/api/v1/account');
    assert.equal(init.headers.authorization, 'Bearer fixture-cloud-token');
    return Response.json({ data: { plan: 'fixture' } });
  } });
  await assert.rejects(ensureCloud({ env: {}, interactive: false, token: () => null, log() {} }), /needs authentication/);
});

test('Cloud login completes before checking the connection and npx uses the requested package', async () => {
  let connected = false;
  await ensureCloud({ env: {}, interactive: true, token: () => connected ? 'fixture-token' : null, login: () => {
    const loginChild = child();
    queueMicrotask(() => { connected = true; loginChild.emit('exit', 0); });
    return loginChild;
  }, fetchImpl: async () => Response.json({}), log() {} });
  npmChild('mola-core@^1.5.0', ['start'], { env: {}, spawnImpl: (command, args) => {
    assert.ok(command.startsWith('npx'));
    assert.deepEqual(args, ['--yes', 'mola-core@^1.5.0', 'start']);
    return child();
  } });
});
