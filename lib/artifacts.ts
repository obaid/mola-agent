import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { configDir } from './config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

function directory(threadId: string) {
  if (!UUID.test(threadId)) throw new Error('Invalid conversation id.');
  return join(configDir(), 'artifacts', threadId);
}

export function saveArtifact(threadId: string, path: string, base64: string) {
  if (base64.length > Math.ceil(MAX_ARTIFACT_BYTES * 4 / 3) + 4) throw new Error('Files must be 10 MB or smaller.');
  const data = Buffer.from(base64, 'base64');
  if (data.length > MAX_ARTIFACT_BYTES) throw new Error('Files must be 10 MB or smaller.');
  const id = randomUUID();
  const filename = basename(path).replace(/[\x00-\x1f\x7f]/g, '_').slice(0, 180) || 'download';
  const dir = directory(threadId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, `${id}.data`), data, { mode: 0o600 });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ filename, bytes: data.length }), { mode: 0o600 });
  return { id, filename, bytes: data.length, url: `/api/files/${threadId}/${id}` };
}

export function readArtifact(threadId: string, id: string) {
  if (!UUID.test(id)) throw new Error('Invalid file id.');
  const dir = directory(threadId);
  const meta = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
  return { filename: String(meta.filename), data: readFileSync(join(dir, `${id}.data`)) };
}
