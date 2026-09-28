import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort } from './free-port.js';

/**
 * Conversations, exercised through the HTTP API against the real built server.
 *
 * Testing the storage module directly would be faster, but these routes are the
 * only way the app reaches it, and a route that forgets to await its params is
 * a bug the module tests would never see.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const built = existsSync(join(root, 'server', 'server.js'));

let child;
let base;
let home;

before(async () => {
  if (!built) return;
  home = mkdtempSync(join(tmpdir(), 'mola-agent-threads-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;

  child = spawn(process.execPath, [join(root, 'server', 'server.js')], {
    cwd: join(root, 'server'),
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      MOLA_AGENT_HOME: home,
      // Point at a port nothing is on, so the engine is definitively absent and
      // these tests never touch a real machine.
      MOLA_PORT: '4999',
    },
    stdio: 'ignore',
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const probe = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (probe.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the server never started');
});

after(() => {
  child?.kill('SIGKILL');
  if (home) rmSync(home, { recursive: true, force: true });
});

const json = async (path, init) => {
  const response = await fetch(`${base}${path}`, init);
  return { status: response.status, body: await response.json() };
};

test('a conversation is created, listed, read and deleted', { skip: built ? false : 'build first' }, async () => {
  const created = await json('/api/threads', { method: 'POST' });
  assert.equal(created.status, 200);
  const { id } = created.body.thread;
  assert.equal(created.body.thread.machineId, null, 'a new conversation owns no machine');

  const listed = await json('/api/threads');
  assert.ok(listed.body.threads.some((t) => t.id === id));

  const read = await json(`/api/threads/${id}`);
  assert.equal(read.body.thread.id, id);
  assert.deepEqual(read.body.thread.messages, []);

  const removed = await json(`/api/threads/${id}`, { method: 'DELETE' });
  assert.equal(removed.body.deleted, true);
  assert.equal((await json(`/api/threads/${id}`)).status, 404);
});

test('clearing a conversation keeps its identity and computer', { skip: built ? false : 'build first' }, async () => {
  const { thread } = (await json('/api/threads', { method: 'POST' })).body;
  const file = join(home, 'threads', `${thread.id}.json`);
  writeFileSync(file, JSON.stringify({
    ...thread,
    title: 'Earlier request',
    machineId: 'machine-to-keep',
    messages: [{ id: 'old-message', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
  }));

  const cleared = await json(`/api/threads/${thread.id}`, { method: 'PATCH' });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.thread.id, thread.id);
  assert.equal(cleared.body.thread.machineId, 'machine-to-keep');
  assert.equal(cleared.body.thread.title, 'New conversation');
  assert.deepEqual(cleared.body.thread.messages, []);
  assert.deepEqual((await json(`/api/threads/${thread.id}`)).body.thread.messages, []);

  await json(`/api/threads/${thread.id}`, { method: 'DELETE' });
});

test('conversations come back newest first', { skip: built ? false : 'build first' }, async () => {
  const before = (await json('/api/threads')).body.threads.length;
  const first = (await json('/api/threads', { method: 'POST' })).body.thread;
  await new Promise((r) => setTimeout(r, 1100)); // updatedAt has second resolution
  const second = (await json('/api/threads', { method: 'POST' })).body.thread;

  const threads = (await json('/api/threads')).body.threads;
  assert.equal(threads.length, before + 2);
  assert.equal(threads[0].id, second.id, 'the newest should lead');

  await json(`/api/threads/${first.id}`, { method: 'DELETE' });
  await json(`/api/threads/${second.id}`, { method: 'DELETE' });
});

test('a thread id that is not a uuid cannot escape the directory', { skip: built ? false : 'build first' }, async () => {
  const snapshot = readdirSync(home).sort();
  for (const attempt of ['..%2F..%2Fconfig', 'not-a-uuid', '%2Fetc%2Fpasswd']) {
    const response = await fetch(`${base}/api/threads/${attempt}`);
    assert.ok(response.status >= 400, `${attempt} should be refused, got ${response.status}`);
  }
  // Stronger than checking for specific names: nothing new appeared anywhere in
  // the config directory as a result of those attempts.
  assert.deepEqual(readdirSync(home).sort(), snapshot);
  for (const entry of readdirSync(home)) {
    assert.ok(['config.json', 'threads'].includes(entry), `unexpected entry: ${entry}`);
  }
});

test('chat refuses a message for a conversation that does not exist', { skip: built ? false : 'build first' }, async () => {
  const response = await json('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId: '00000000-0000-4000-8000-000000000000', messages: [] }),
  });
  assert.equal(response.status, 404);
});

test('chat refuses a cross-origin caller', { skip: built ? false : 'build first' }, async () => {
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ threadId: 'x', messages: [] }),
  });
  assert.equal(response.status, 403);
});

test('the machines view degrades honestly when the engine is absent', { skip: built ? false : 'build first' }, async () => {
  const response = await json('/api/machines');
  assert.equal(response.status, 502);
  assert.match(response.body.error, /engine|npx mola-core/i);
});

test('the desktop refuses a conversation with no machine', { skip: built ? false : 'build first' }, async () => {
  const { thread } = (await json('/api/threads', { method: 'POST' })).body;
  const response = await json('/api/desktop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId: thread.id }),
  });
  assert.equal(response.status, 409);
  assert.match(response.body.error, /no machine/i);
  await json(`/api/threads/${thread.id}`, { method: 'DELETE' });
});

test('watching a conversation with no machine is harmless', { skip: built ? false : 'build first' }, async () => {
  const { thread } = (await json('/api/threads', { method: 'POST' })).body;
  const response = await json('/api/watching', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId: thread.id }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'none');
  await json(`/api/threads/${thread.id}`, { method: 'DELETE' });
});

test('watching keeps a machine from being reaped as idle', { skip: built ? false : 'build first' }, async () => {
  // Give the thread a machine and an old activity stamp, as if nobody had
  // touched it for an hour.
  const { thread } = (await json('/api/threads', { method: 'POST' })).body;
  const file = join(home, 'threads', `${thread.id}.json`);
  const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  writeFileSync(file, JSON.stringify({
    ...thread, machineId: 'machine-under-test', machineTouchedAt: stale,
  }));

  await json('/api/watching', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId: thread.id }),
  });

  const after = JSON.parse(readFileSync(file, 'utf8'));
  assert.notEqual(after.machineTouchedAt, stale, 'watching should refresh the activity stamp');
  assert.ok(
    Date.now() - new Date(after.machineTouchedAt).getTime() < 10_000,
    'the refreshed stamp should be recent',
  );
  await json(`/api/threads/${thread.id}`, { method: 'DELETE' });
});


test('attachments download real bytes, survive clear, and stay scoped to their conversation', { skip: built ? false : 'build first' }, async () => {
  const { thread } = (await json('/api/threads', { method: 'POST' })).body;
  const other = (await json('/api/threads', { method: 'POST' })).body.thread;
  const id = '11111111-2222-4333-8444-555555555555';
  const dir = join(home, 'artifacts', thread.id);
  mkdirSync(dir, { recursive: true });
  const data = 'product,revenue\r\nBeta,91.00\r\n';
  writeFileSync(join(dir, `${id}.data`), data);
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ filename: 'sales summary.csv', bytes: Buffer.byteLength(data) }));
  await json(`/api/threads/${thread.id}`, { method: 'PATCH' });
  const response = await fetch(`${base}/api/files/${thread.id}/${id}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), data);
  assert.match(response.headers.get('content-disposition'), /attachment;.*sales%20summary.csv/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(`${base}/api/files/${other.id}/${id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/files/${thread.id}/not-a-file`)).status, 404);
  await json(`/api/threads/${thread.id}`, { method: 'DELETE' });
  assert.equal((await fetch(`${base}/api/files/${thread.id}/${id}`)).status, 404);
  await json(`/api/threads/${other.id}`, { method: 'DELETE' });
});
