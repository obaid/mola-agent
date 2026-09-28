'use client';

import { useState } from 'react';

/**
 * One tool call.
 *
 * Details stay closed until someone asks for them. The activity group tells
 * them what is happening; this card lets them inspect one action.
 */

const LABELS: Record<string, string> = {
  create_machine: 'new computer',
  open_browser: 'opened Chromium',
  run_command: 'ran',
  start_task: 'started',
  check_task: 'checking',
  read_file: 'read',
  write_file: 'wrote',
  export_file: 'attached a file',
  screenshot: 'looked at the screen',
  click: 'clicked',
  move_mouse: 'moved to',
  scroll: 'scrolled',
  type_text: 'typed',
  press_key: 'pressed',
  delete_machine: 'deleted the computer',
};

/**
 * The same tools, named for something that has not happened yet.
 *
 * A card asking permission that reads "deleted the computer" describes the
 * thing it is trying to prevent.
 */
const PENDING: Record<string, string> = {
  delete_machine: 'wants to delete the computer',
  run_command: 'wants to run',
  write_file: 'wants to write',
  start_task: 'wants to start',
};

function summarise(name: string, input: any = {}) {
  if (input.command) return input.command;
  if (input.text) return `"${input.text}"`;
  if (input.key) return input.key;
  if (input.path) return input.path;
  if (input.direction) return input.direction;
  if (typeof input.x === 'number') return `${input.x}, ${input.y}`;
  return '';
}

function Output({ name, output }: { name: string; output: any }) {
  if (output == null) return null;

  // The picture the agent looked at.
  if (name === 'screenshot') {
    const media = output?.data ? output : output?.content?.find?.((c: any) => c.type === 'media');
    if (media?.data) {
      return (
        <img
          className="shot"
          src={`data:${media.mediaType};base64,${media.data}`}
          alt="What the agent saw on the screen"
        />
      );
    }
  }

  // A long job's progress is the whole reason check_task exists.
  if (name === 'check_task') {
    return (
      <>
        <span className={output.running ? 'badge live' : 'badge done'}>
          {output.running ? 'still running' : 'finished'}
        </span>
        {output.output && <pre>{String(output.output).slice(-1500)}</pre>}
      </>
    );
  }

  if (name === 'start_task') {
    return <span className="badge live">running in the background</span>;
  }

  if (name === 'run_command') {
    if (output.timed_out) {
      return (
        <>
          <span className="badge bad">hit the time limit</span>
          {output.partial_output && <pre>{String(output.partial_output).slice(-1500)}</pre>}
        </>
      );
    }
    const text = `${output.stdout ?? ''}${output.stderr ?? ''}`.trimEnd();
    return (
      <>
        {output.exit_code !== 0 && <span className="badge bad">exit {output.exit_code}</span>}
        {text && <pre>{text.slice(-4000)}</pre>}
      </>
    );
  }

  if (name === 'create_machine') {
    return <span className="badge done">{output.id?.slice(0, 8)} · {output.memory_mb} MB</span>;
  }

  if (name === 'open_browser') {
    return <span className={output.opened ? 'badge done' : 'badge bad'}>{output.opened ? (output.reused ? 'Reused Chromium window' : 'Chromium opened') : output.error ?? 'Could not open Chromium'}</span>;
  }

  if (name === 'read_file' && output.content) {
    return <pre>{String(output.content).slice(0, 2000)}</pre>;
  }

  // Everything else is a one-liner; a JSON dump would be noise.
  return null;
}

export default function ToolCard({
  part,
  onApprove,
}: {
  part: any;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const name = part.type.replace(/^tool-/, '');
  const [open, setOpen] = useState(false);
  const running = part.state === 'input-streaming' || part.state === 'input-available';
  const failed = part.state === 'output-error';
  const asking = part.state === 'approval-requested';
  const summary = summarise(name, part.input);

  return (
    <div className={`tool ${failed ? 'failed' : ''} ${asking ? 'asking' : ''}`}>
      <button type="button" className="tool-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <code>{asking ? (PENDING[name] ?? `wants to ${name}`) : (LABELS[name] ?? name)}</code>
        {summary && <span className="muted small">{summary}</span>}
        {running && <span className="spin" aria-label="running" />}
        <span className="tool-expand">{open ? '−' : '+'}</span>
      </button>

      {asking && (
        <div className="approve">
          <p>This cannot be undone.</p>
          <button onClick={() => onApprove(part.approval.id, true)}>Allow</button>
          <button className="ghost" onClick={() => onApprove(part.approval.id, false)}>Deny</button>
        </div>
      )}

      {open && part.state === 'output-available' && <Output name={name} output={part.output} />}
      {open && failed && <pre className="error">{part.errorText}</pre>}
    </div>
  );
}
