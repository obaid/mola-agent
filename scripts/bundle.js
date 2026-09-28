#!/usr/bin/env node
/**
 * Collect Next's standalone build into one directory the npm tarball can ship.
 *
 * `next build` with `output: 'standalone'` writes a server and a pruned
 * node_modules into `.next/standalone`, but deliberately leaves two things
 * behind: `.next/static` and `public`. Next's own docs say to copy them, and
 * forgetting is the classic standalone bug — the server starts, serves HTML,
 * and every stylesheet and script 404s, so you get an unstyled page rather than
 * an error.
 *
 * Everything lands in `server/`, which is what `files` publishes.
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const standalone = join(root, '.next', 'standalone');
const out = join(root, 'server');

if (!existsSync(standalone)) {
  console.error('No .next/standalone. Run `next build` first, with output: "standalone".');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(standalone, out, { recursive: true });

// The two directories the standalone output does not include.
const staticDir = join(root, '.next', 'static');
if (existsSync(staticDir)) {
  cpSync(staticDir, join(out, '.next', 'static'), { recursive: true });
}
const publicDir = join(root, 'public');
if (existsSync(publicDir)) {
  cpSync(publicDir, join(out, 'public'), { recursive: true });
}

if (!existsSync(join(out, 'server.js'))) {
  console.error('The bundle has no server.js. Next changed its standalone layout.');
  process.exit(1);
}

if (['server', 'artifacts', 'test', 'docs'].some((dir) => existsSync(join(out, dir)))) {
  console.error('The bundle contains a previous build or development files. Check outputFileTracingExcludes before publishing.');
  process.exit(1);
}

function bytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? bytes(path) : statSync(path).size;
  }
  return total;
}

console.log(`bundled server/ — ${(bytes(out) / 1024 / 1024).toFixed(1)} MB`);
