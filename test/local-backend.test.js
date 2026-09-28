import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalCoreBackend } from '../lib/backends/local.ts';

test('the local backend lists and normalizes real Core response shapes', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'mola-backend-'));
  writeFileSync(join(scratch, 'token'), 'fixture-token');
  const originalHome = process.env.MOLA_HOME;
  const originalFetch = globalThis.fetch;
  process.env.MOLA_HOME = scratch;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/v1/machines'));
    assert.equal(options.headers.authorization, 'Bearer fixture-token');
    return Response.json({ data: [
      { id: 'ready-machine', name: 'agent', status: 'ready', memory_mb: 4096 },
      { id: 'stopped-machine', name: 'retained', status: 'stopped', memory_mb: 2048 },
    ] });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalHome === undefined) delete process.env.MOLA_HOME;
    else process.env.MOLA_HOME = originalHome;
    rmSync(scratch, { recursive: true, force: true });
  });

  const machines = await new LocalCoreBackend().listComputers();
  assert.deepEqual(machines.map(({ id, status, memory_mb }) => ({ id, status, memory_mb })), [
    { id: 'ready-machine', status: 'ready', memory_mb: 4096 },
    { id: 'stopped-machine', status: 'stopped', memory_mb: 2048 },
  ]);
});
