import { readFileSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function cloudApi(env = process.env) {
  const url = new URL(env.MOLA_CLOUD_API || env.MOLA_API_URL || 'https://cloud.mola.sh/api/v1');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('The cloud API must be an HTTPS URL without credentials, query or fragment.');
  }
  return url.href.replace(/\/$/, '');
}

/** Read the same private, per-API credentials as `mola-cloud login`. */
export function cloudToken(env = process.env) {
  if (env.MOLA_TOKEN) return env.MOLA_TOKEN;
  const file = join(env.MOLA_CONFIG_DIR || join(homedir(), '.config', 'mola-cloud'), 'credentials.json');
  let stat;
  try { stat = lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) {
    throw new Error('Cloud credentials must be a regular private file (chmod 600).');
  }
  const saved = JSON.parse(readFileSync(file, 'utf8'))[cloudApi(env)];
  return typeof saved?.access_token === 'string' ? saved.access_token : null;
}
