import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

  const contents = execFileSync('tar', ['-tzf', join(scratch, tarball)], { encoding: 'utf8' }).split('\n');
  assert.equal(contents.some((file) => /^package\/server\/(server|artifacts|test|docs)\//.test(file)), false,
    'standalone must not contain previous bundles or development evidence');

  execFileSync('npm', ['init', '-y'], { cwd: scratch, stdio: 'ignore' });
  execFileSync('npm', ['install', join(scratch, tarball), '--silent'], { cwd: scratch, stdio: 'ignore' });

  // Next and the UI stay bundled. Sharp must be installed for the destination
  // platform rather than copied from the machine that produced the tarball.
  const installed = readdirSync(join(scratch, 'node_modules')).filter((n) => !n.startsWith('.'));
  assert.ok(installed.includes('sharp'), 'Sharp runtime dependency was not installed');
  assert.equal(installed.includes('next'), false, 'Next should remain bundled');
  assert.equal(existsSync(join(scratch, 'node_modules', 'mola-agent', 'server', 'node_modules', 'sharp')), false,
    'a traced Sharp package would shadow the platform-specific installation');

  // Exercise a real image transform using resolution from the installed
  // standalone server. This catches missing native binaries/libvips too.
  const serverPath = join(scratch, 'node_modules', 'mola-agent', 'server', 'server.js');
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { createRequire } from 'node:module';
    import assert from 'node:assert/strict';
    const sharp = createRequire(${JSON.stringify(pathToFileURL(serverPath).href)})('sharp');
    const image = await sharp({ create: { width: 1280, height: 800, channels: 3, background: '#fff' } })
      .resize(1024, 640).png().toBuffer();
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 640);
  `], { cwd: scratch, stdio: 'pipe' });

  const port = await freePort();
  const child = spawn(join(scratch, 'node_modules', '.bin', 'mola-agent'), [], {
    cwd: scratch,
    env: { ...process.env, PORT: String(port), MOLA_AGENT_NO_OPEN: '1', MOLA_AGENT_BOOTSTRAP: '0', MOLA_AGENT_HOME: join(scratch, 'home'), MOLA_BACKEND: 'local', MOLA_PORT: '4999' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', (data) => { serverOutput += data; });
  child.stderr.on('data', (data) => { serverOutput += data; });
  t.after(() => child.kill('SIGTERM'));

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
  assert.ok(up, `the packaged server never answered /api/health: ${serverOutput}`);

  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.service, 'mola-agent');
  assert.ok('engine' in health, 'health should report on the engine, reachable or not');

  // Import the agent/tool graph as a real chat request would. Health and HTML
  // don't load screenshot processing, so they cannot catch a missing Sharp.
  const chat = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId: randomUUID(), messages: [] }),
  });
  assert.equal(chat.status, 404, `chat route failed to load: ${await chat.text()}\n${serverOutput}`);

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
