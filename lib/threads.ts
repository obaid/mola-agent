import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { configDir } from './config';

/**
 * Conversations on disk.
 *
 * One JSON file per thread, written atomically. A database would be the
 * reflex, but a single person's chat history does not need one, and the
 * absence of one is a feature in a repository people open to work out how the
 * pieces fit together.
 *
 * The AI SDK's memory API was considered and does not apply: it gives a model
 * long-term recall, which is a different problem from storing what was said.
 */

export type Thread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** The machine this conversation owns. Null until a tool needs one. */
  machineId: string | null;
  /** Last time the machine did anything, for the idle reaper. */
  machineTouchedAt: string | null;
  messages: unknown[];
};

function threadsDir() {
  const dir = join(configDir(), 'threads');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

const fileFor = (id: string) => join(threadsDir(), `${id}.json`);

/** Reject anything that is not a UUID we generated, so no path escapes the directory. */
function checkId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Not a thread id.');
  return id;
}

export function createThread(): Thread {
  const now = new Date().toISOString();
  const thread: Thread = {
    id: randomUUID(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    machineId: null,
    machineTouchedAt: null,
    messages: [],
  };
  write(thread);
  return thread;
}

export function readThread(id: string): Thread | null {
  const file = fileFor(checkId(id));
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Thread;
  } catch {
    // A half-written file from a hard kill should not take out the whole list.
    return null;
  }
}

/**
 * Write via a temporary file and rename.
 *
 * rename is atomic on the same filesystem, so a reader either sees the old
 * thread or the new one, never a half-serialised message that fails to parse.
 */
export function write(thread: Thread) {
  const file = fileFor(thread.id);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(thread, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
  return thread;
}

export function update(id: string, patch: Partial<Thread>) {
  const thread = readThread(id);
  if (!thread) return null;
  return write({ ...thread, ...patch, updatedAt: new Date().toISOString() });
}

/** Start over in this conversation without discarding its computer. */
export function clearThread(id: string) {
  return update(id, { title: 'New conversation', messages: [] });
}

/** Newest first, without the messages, for the sidebar. */
export function listThreads() {
  return readdirSync(threadsDir())
    .filter((name) => name.endsWith('.json'))
    .map((name) => readThread(name.replace(/\.json$/, '')))
    .filter((t): t is Thread => t !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ messages, ...rest }) => ({ ...rest, messageCount: messages.length }));
}

export function deleteThread(id: string) {
  rmSync(fileFor(checkId(id)), { force: true });
  rmSync(join(configDir(), 'artifacts', id), { recursive: true, force: true });
}

/** Every machine this app believes it owns, so the reaper never touches anything else. */
export function ownedMachines() {
  return listThreads()
    .filter((t) => t.machineId)
    .map((t) => ({ threadId: t.id, machineId: t.machineId!, touchedAt: t.machineTouchedAt }));
}

/**
 * Name a conversation after what was actually asked.
 *
 * "New conversation" in a list of ten is useless, and asking a model to write a
 * title costs a round trip for something the first sentence already says.
 */
export function titleFrom(text: string) {
  const line = text.trim().split('\n')[0].replace(/\s+/g, ' ');
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || 'New conversation';
}
