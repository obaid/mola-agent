import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileLib } from './compile-lib.js';

const compiled = compileLib();
const home = mkdtempSync(join(tmpdir(), 'mola-cloud-home-'));
const env = { ...process.env };
const originalFetch = globalThis.fetch;
process.env.MOLA_BACKEND = 'cloud';
process.env.MOLA_TOKEN = 'fixture-token';
process.env.MOLA_CLOUD_API = 'https://cloud.fixture/api/v1';
process.env.MOLA_AGENT_HOME = home;
const cloud = await compiled.load('cloud');
const backend = await compiled.load('backend');
const { buildTools } = await compiled.load('tools');
after(() => {
  globalThis.fetch = originalFetch;
  for (const name of ['MOLA_BACKEND', 'MOLA_TOKEN', 'MOLA_CLOUD_API', 'MOLA_AGENT_HOME']) {
    if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
  }
  rmSync(home, { recursive: true, force: true });
  rmSync(compiled.output, { recursive: true, force: true });
});

const profile = { slug: 'small', name: 'Small', vcpus: 2, memory_mb: 4096, disk_gb: 20 };
const machine = (status = 'ready') => ({ id: 'computer-1', name: 'agent-thread-1', status, profile });
function mock(handler) {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.authorization, 'Bearer fixture-token');
    assert.ok(String(url).startsWith('https://cloud.fixture/api/v1'));
    return handler(String(url).replace('https://cloud.fixture/api/v1', ''), options);
  };
}

test('cloud creation preserves operation, waits for succeeded, and returns fresh machine specs', async () => {
  const calls = [];
  mock((path, options) => {
    calls.push(`${options.method} ${path}`);
    if (path === '/profiles') return Response.json({ data: [profile] });
    if (path === '/computers') {
      assert.deepEqual(JSON.parse(options.body), { name: 'agent-thread-1', profile: 'small' });
      return Response.json({ data: machine('provisioning'), operation: { id: 'op-1', status: 'pending' } }, { status: 201 });
    }
    if (path === '/computers/computer-1/operations/op-1') return Response.json({ data: { id: 'op-1', status: 'succeeded' } });
    if (path === '/computers/computer-1') return Response.json({ data: machine() });
    assert.fail(`Unexpected request ${path}`);
  });
  const result = await backend.createMachine({ name: 'agent-thread-1' });
  assert.equal(result.id, 'computer-1');
  assert.equal(result.status, 'ready');
  assert.equal(result.memory_mb, 4096);
  assert.equal(result.profile, 'small');
  assert.deepEqual(calls, ['GET /profiles', 'POST /computers', 'GET /computers/computer-1/operations/op-1', 'GET /computers/computer-1']);
});

test('all cloud collections use the resource data array and catalog slugs', async () => {
  mock((path) => Response.json({ data: path === '/profiles' ? [profile]
    : path === '/images' ? [{ slug: 'omarchy', name: 'Omarchy' }]
    : path.endsWith('/snapshots') ? [{ id: 'snapshot-1' }] : [machine()] }));
  assert.equal((await cloud.getProfiles())[0].id, 'small');
  assert.equal((await cloud.getProfiles())[0].available, true);
  assert.equal((await cloud.getImages())[0].id, 'omarchy');
  assert.equal((await backend.listMachines())[0].id, 'computer-1');
  assert.equal((await cloud.listSnapshots('computer-1'))[0].id, 'snapshot-1');
});

test('a stopped thread computer resumes and successive real agent tools reuse it', async () => {
  let status = 'stopped';
  let starts = 0;
  let commands = 0;
  let polled = 0;
  mock((path, options) => {
    if (path === '/computers' && options.method === 'GET') return Response.json({ data: [machine(status)] });
    if (path.endsWith('/start')) { starts++; return Response.json({ data: machine('booting'), operation: { id: 'op-start' } }); }
    if (path.endsWith('/operations/op-start')) { status = 'ready'; polled++; return Response.json({ data: { status: 'succeeded' } }); }
    if (path === '/computers/computer-1') return Response.json({ data: machine(status) });
    if (path.endsWith('/actions')) { commands++; return Response.json({ data: { stdout: 'cloud works\n', stderr: '', exit_code: 0 } }); }
    assert.fail(`Unexpected request ${options.method} ${path}`);
  });
  const assigned = [];
  const session = { threadId: 'thread-1', machineId: null, onMachine: (id) => assigned.push(id) };
  const tools = buildTools(session);
  for (let i = 0; i < 2; i++) {
    const result = await tools.run_command.execute({ command: 'echo cloud works' });
    assert.equal(result.stdout, 'cloud works\n');
  }
  assert.equal(starts, 1);
  assert.equal(polled, 1);
  assert.equal(commands, 2);
  assert.equal(session.machineId, 'computer-1');
  assert.deepEqual(assigned, ['computer-1', 'computer-1']);
});

test('API failures remain actionable and do not cause another provisioning attempt', async () => {
  let requests = 0;
  mock(() => { requests++; return Response.json({ error: { code: 'unauthenticated', message: 'A valid API token is required.' } }, { status: 401 }); });
  await assert.rejects(buildTools({ threadId: 'thread-1', machineId: null }).run_command.execute({ command: 'true' }), /valid API token/);
  assert.equal(requests, 1);
  mock(() => Response.json({ data: {} }));
  await assert.rejects(cloud.listCloudComputers(), /invalid computers list/);
  await assert.rejects(cloud.createCloudComputer({ name: 'agent', profile: 'small' }), /missing id or status/);
  mock(() => Response.json({ data: { status: 'failed', error_message: 'No capacity available' } }));
  await assert.rejects(cloud.waitForOperation('computer-1', 'op-1'), /No capacity available/);
  mock(() => Response.json({ data: { status: 'cancelled' } }));
  await assert.rejects(cloud.waitForOperation('computer-1', 'op-1'), /failed/i);
  mock(() => Response.json({ data: machine('error') }));
  await assert.rejects(backend.waitForReady('computer-1'), /error/);
});

test('desktop uses the gateway grant without exposing an undefined iframe URL', async () => {
  const grant = { ws_url: 'wss://computer.mola.sh/desktop', token: 'single-use-fixture', expires_in: 60 };
  mock(() => Response.json(grant, { status: 201 }));
  assert.deepEqual(await cloud.createDesktopSession('computer-1'), grant);
  assert.equal(await backend.desktopUrl('computer-1'), 'https://cloud.fixture/computers/computer-1/desktop');
});
