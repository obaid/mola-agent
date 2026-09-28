'use client';

import { useState } from 'react';
import ToolCard from './ToolCard';

const ACTIONS: Record<string, string> = {
  create_machine: 'Starting the computer',
  open_browser: 'Opening Chromium',
  run_command: 'Running a command',
  start_task: 'Starting a task',
  check_task: 'Checking a task',
  read_file: 'Reading a file',
  write_file: 'Writing a file',
  export_file: 'Attaching a file',
  screenshot: 'Looking at the screen',
  click: 'Using the desktop',
  move_mouse: 'Using the desktop',
  scroll: 'Scrolling',
  type_text: 'Typing',
  press_key: 'Using the keyboard',
  delete_machine: 'Deleting the computer',
};

export default function ActivityGroup({
  parts,
  onApprove,
  showPreview,
  onShowDesktop,
}: {
  parts: any[];
  onApprove: (id: string, approved: boolean) => void;
  showPreview?: boolean;
  onShowDesktop?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pending = parts.filter((part) => part.state === 'approval-requested');
  const running = parts.some((part) => part.state === 'input-streaming' || part.state === 'input-available');
  const failed = parts.some((part) => part.state === 'output-error');
  const last = parts.at(-1);
  const action = ACTIONS[last?.type?.replace(/^tool-/, '')] ?? 'Working on the computer';
  const latestShot = showPreview ? parts.slice().reverse().find((part: any) => part.type === 'tool-screenshot' && part.state === 'output-available')?.output : null;
  const media = latestShot?.data ? latestShot : latestShot?.content?.find?.((item: any) => item.type === 'media' && item.data);
  const preview = media?.data ? `data:${media.mediaType ?? 'image/png'};base64,${media.data}` : null;

  return (
    <div className={`activity ${failed ? 'failed' : ''}`}>
      <button
        type="button"
        className="activity-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={running ? 'activity-pulse' : 'activity-dot'} aria-hidden="true" />
        <span>{failed ? 'Computer activity needs attention' : running ? action : 'Computer activity'}</span>
        <span className="muted small">· {parts.length} action{parts.length === 1 ? '' : 's'}</span>
        {failed && <span className="error small">Issue</span>}
        <span className="activity-expand">{open ? 'Hide details' : 'Show details'}</span>
      </button>
      {open && <div className="activity-details">
        {parts.map((part, index) => <ToolCard key={part.toolCallId ?? index} part={part} onApprove={onApprove} />)}
      </div>}
      {!open && pending.map((part, index) => (
        <ToolCard key={part.toolCallId ?? index} part={part} onApprove={onApprove} />
      ))}
      {parts.filter((part) => part.type === 'tool-export_file' && part.state === 'output-available' && part.output?.url).map((part) => (
        <a key={part.toolCallId} className="file-attachment" href={part.output.url} download>
          <strong>{part.output.filename}</strong>
          <span className="muted small">{Math.ceil(part.output.bytes / 1024)} KB · Download</span>
        </a>
      ))}
      {!open && preview && <div className="activity-preview">
        <img src={preview} alt="Latest screen seen by the agent" loading="lazy" />
        <div>
          <span className="muted small">Latest screen</span>
          {onShowDesktop && <button type="button" className="link" onClick={onShowDesktop}>Open live desktop</button>}
        </div>
      </div>}
    </div>
  );
}
