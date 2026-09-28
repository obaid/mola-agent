import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort } from './free-port.js';

/**
 * The test that decides the framework.
 *
 * Next's standalone output inside an npm tarball is the one genuinely unusual
 * thing this project does, and its failure mode is quiet: the server starts,
 * serves HTML, and every asset 404s, so you get an unstyled page rather than an
 * error. So this packs, installs and boots the real artifact, then checks that
 * every asset the page references actually resolves.
 *
 * Slow on purpose. It is the only thing standing between us and shipping a
 * package that looks fine locally and is broken everywhere else.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const built = existsSync(join(root, 'server', 'server.js'));

test('the packaged tarball installs, boots and serves every asset', { skip: built ? false : 'run `npm run build && npm run bundle` first', timeout: 300_000 }, async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'mola-agent-pack-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));

  // Other suites boot this same build concurrently. Packing must not rebuild
  // and remove chunks underneath their running servers.
  const tarball = execFileSync('npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', scratch], {
    cwd: root, encoding: 'utf8',
  }).trim().split('\n').pop();

  execFileSync('npm', ['init', '-y'], { cwd: scratch, stdio: 'ignore' });
  execFileSync('npm', ['install', join(scratch, tarball), '--silent'], { cwd: scratch, stdio: 'ignore' });

  // Nothing but our own package: standalone bundles what it needs, so the
  // published package declares no runtime dependencies.
  const installed = readdirSync(join(scratch, 'node_modules')).filter((n) => !n.startsWith('.'));
  assert.deepEqual(installed, ['mola-agent'], `unexpected runtime deps: ${installed}`);

  const port = await freePort();
  const child = spawn(join(scratch, 'node_modules', '.bin', 'mola-agent'), [], {
    cwd: scratch,
    env: { ...process.env, PORT: String(port), MOLA_AGENT_NO_OPEN: '1', MOLA_AGENT_BOOTSTRAP: '0', MOLA_AGENT_HOME: join(scratch, 'home'), MOLA_BACKEND: 'local', MOLA_PORT: '4999' },
    stdio: 'ignore',
  });
  t.after(() => child.kill('SIGKILL'));

  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let attempt = 0; attempt < 80 && !up; attempt += 1) {
    try {
      const probe = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
      up = probe.ok;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  assert.ok(up, 'the packaged server never answered /api/health');

  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.service, 'mola-agent');
  assert.ok('engine' in health, 'health should report on the engine, reachable or not');

  const html = await (await fetch(base)).text();
  assert.match(html, /<title>Mola Agent<\/title>/);

  // The standalone bug this bundler exists to prevent.
  const assets = [...html.matchAll(/(?:href|src)="(\/_next\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(assets.length > 0, 'the page referenced no build assets at all');
  assert.ok(assets.some((a) => a.endsWith('.css')), 'no stylesheet was referenced');

  for (const asset of new Set(assets)) {
    const response = await fetch(`${base}${asset}`);
    assert.equal(response.status, 200, `${asset} did not resolve`);
  }
});
