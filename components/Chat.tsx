'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DesktopPanel from './DesktopPanel';
import ActivityGroup from './ActivityGroup';
import Threads, { type ThreadSummary } from './Threads';
import Machines from './Machines';
import Settings from './Settings';
import Snapshots from './Snapshots';

type Machine = { id: string; name: string; status: string; threadId: string | null };
import type { AccountInfo } from '../lib/cloud';

function contentGroups(parts: any[]) {
  const groups: { type: 'text' | 'tools'; parts: any[]; start: number }[] = [];
  parts.forEach((part, index) => {
    // The SDK inserts step markers and reasoning between tool calls. Neither
    // is shown in chat, and neither should split one run into dozens of rows.
    if (part.type !== 'text' && !part.type?.startsWith('tool-')) return;
    if (part.type === 'text' && !part.text) return;
    const type = part.type?.startsWith('tool-') ? 'tools' : 'text';
    const previous = groups.at(-1);
    if (type === 'tools' && previous?.type === 'tools') previous.parts.push(part);
    else groups.push({ type, parts: [part], start: index });
  });
  return groups;
}

export default function Chat({ model, provider, backend }: { model: string; provider: string; backend: 'local' | 'cloud' }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initial, setInitial] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [showDesktop, setShowDesktop] = useState(false);
  const [showMachines, setShowMachines] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [usageWarning, setUsageWarning] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // The thread id has to reach the server with every message, and changing
  // threads has to reset the conversation, which is what the key on useChat does.
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({ threadId }),
    }),
    [threadId],
  );

  const { messages, sendMessage, status, error, clearError: dismissRunError, addToolApprovalResponse, stop, setMessages } = useChat({
    transport,
    messages: initial as any,
  });

  const refreshThreads = useCallback(async () => {
    const [t, m] = await Promise.all([
      fetch('/api/threads').then((r) => r.json()),
      fetch('/api/machines').then((r) => r.json()).catch(() => ({ machines: [] })),
    ]);
    setThreads(t.threads);
    setMachines(m.machines ?? []);
    return t.threads as ThreadSummary[];
  }, []);

  const refreshAccount = useCallback(async () => {
    if (backend === 'cloud') {
      try {
        const response = await fetch('/api/account');
        const data = await response.json();
        if (response.ok && data.account) {
          setAccount(data.account);
          
          // Check usage warnings
          const usage = data.account.usage;
          if (usage) {
            if (usage.computers_running >= (usage.computers_limit ?? 999)) {
              setUsageWarning('At computer limit. Stop unused machines to create new ones.');
            } else if (usage.compute_minutes_limit && usage.compute_minutes_used >= usage.compute_minutes_limit * 0.9) {
              setUsageWarning('Approaching compute minutes limit. Check plan usage.');
            }
          }
        }
      } catch {
        // Account fetch is optional
      }
    }
  }, [backend]);

  // Open the most recent conversation, or start one.
  useEffect(() => {
    (async () => {
      try {
        const existing = await refreshThreads();
        await refreshAccount();
        if (existing.length > 0) await select(existing[0].id);
        else await newThread();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Machine status drives the desktop button, and it appears mid-run, so poll.
  useEffect(() => {
    const tick = setInterval(() => { 
      void refreshThreads(); 
      void refreshAccount();
    }, 4000);
    return () => clearInterval(tick);
  }, [refreshThreads, refreshAccount]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function select(id: string) {
    const { thread } = await fetch(`/api/threads/${id}`).then((r) => r.json());
    dismissRunError();
    setThreadId(id);
    setInitial(thread.messages ?? []);
    setMessages((thread.messages ?? []) as any);
    setShowDesktop(false);
    setConfirmClear(false);
    setClearError(null);
  }

  async function newThread() {
    const { thread } = await fetch('/api/threads', { method: 'POST' }).then((r) => r.json());
    setThreadId(thread.id);
    setInitial([]);
    dismissRunError();
    setMessages([]);
    setShowDesktop(false);
    setConfirmClear(false);
    await refreshThreads();
  }

  async function clearCurrent() {
    if (!threadId || busy) return;
    const response = await fetch(`/api/threads/${threadId}`, { method: 'PATCH' });
    if (!response.ok) {
      setClearError('Could not clear this conversation. Please try again.');
      return;
    }
    dismissRunError();
    setMessages([]);
    setInitial([]);
    setInput('');
    setConfirmClear(false);
    setClearError(null);
    await refreshThreads();
  }

  async function removeThread(id: string, alsoMachine: boolean) {
    await fetch(`/api/threads/${id}?machine=${alsoMachine ? 'delete' : 'keep'}`, { method: 'DELETE' });
    const left = await refreshThreads();
    if (id === threadId) {
      if (left.length > 0) select(left[0].id);
      else newThread();
    }
  }

  const thread = threads.find((t) => t.id === threadId);
  const machineId = thread?.machineId ?? null;
  const busy = status === 'streaming' || status === 'submitted';

  function send() {
    if (!input.trim() || !threadId || busy) return;
    sendMessage({ text: input });
    setInput('');
  }

  if (loading) return <main className="centre"><p className="muted">Opening conversation…</p></main>;
  const renderView = showSettings ? 'settings' 
    : showMachines ? 'machines' 
    : showSnapshots ? 'snapshots'
    : 'chat';

  return (
    <div className={`shell ${showDesktop && renderView === 'chat' ? 'split' : ''}`}>
      <Threads
        threads={threads}
        current={threadId}
        machines={machines}
        onSelect={(id) => { setShowMachines(false); setShowSettings(false); setShowSnapshots(false); select(id); }}
        onNew={() => { setShowMachines(false); setShowSettings(false); setShowSnapshots(false); newThread(); }}
        onDelete={removeThread}
        onShowMachines={() => { setShowMachines((s) => !s); setShowSettings(false); setShowSnapshots(false); }}
        showingMachines={showMachines}
      />

      {renderView === 'settings' && (
        <Settings onClose={() => setShowSettings(false)} />
      )}

      {renderView === 'machines' && (
        <Machines
          onClose={() => setShowMachines(false)}
          onOpenThread={(id) => { setShowMachines(false); select(id); }}
        />
      )}

      {renderView === 'snapshots' && (
        <Snapshots
          computerId={machineId}
          onClose={() => setShowSnapshots(false)}
        />
      )}

      {renderView === 'chat' && <main className="conversation">
        <header className="bar">
          <strong>{thread?.title ?? 'New conversation'}</strong>
          <span className="muted small">
            {backend === 'cloud' ? '☁️ cloud' : '🏠 local'} · {provider} · {model}
          </span>
          {account && account.max_concurrent !== undefined && (
            <span className="muted small" title="Cloud usage">
              {account.used_slots ?? 0}/{account.max_concurrent} running slots ·
              {account.computers_count ?? 0}/{account.max_computers ?? '∞'} computers
            </span>
          )}
          <button
            className="ghost clear-chat"
            disabled={!threadId || messages.length === 0 || busy}
            title={busy ? 'Wait for the agent to finish before clearing' : 'Clear messages in this conversation and keep its computer'}
            onClick={() => { setConfirmClear((value) => !value); setClearError(null); }}
          >Clear chat</button>
          <button
            className="ghost"
            disabled={!machineId}
            title={machineId ? 'Watch the desktop' : 'No machine yet'}
            onClick={() => setShowDesktop((s) => !s)}
          >
            {showDesktop ? 'Hide desktop' : 'Show desktop'}
          </button>
          {backend === 'cloud' && machineId && (
            <button
              className="ghost"
              onClick={() => setShowSnapshots(true)}
              title="Manage snapshots"
            >
              Snapshots
            </button>
          )}
          <button className="ghost" onClick={() => setShowSettings(true)} title="Settings">
            ⚙️
          </button>
        </header>

        {confirmClear && <div className="clear-confirm" role="dialog" aria-label="Clear this chat">
          <span>Clear this conversation? Its computer and files stay available.</span>
          <button onClick={() => void clearCurrent()}>Clear messages</button>
          <button className="ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
        </div>}
        {clearError && <p className="error clear-error">{clearError}</p>}

        <div className="messages">
          {usageWarning && <div className="usage-warning"><strong>{usageWarning}</strong></div>}
          {messages.length === 0 && (
            <div className="empty">
              <p>What would you like me to handle?</p>
              <p className="small">I can browse, research, write, and use a computer you can watch.</p>
              <ul>
                {[
                  'Open Chromium and summarize a web page for me.',
                  'Research a product and compare a few options.',
                  'Make a checklist for my next trip.',
                ].map((suggestion) => (
                  <li key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((message) => {
            const groups = contentGroups(message.parts);
            const lastTools = groups.reduce((last, group, index) => group.type === 'tools' ? index : last, -1);
            return <article key={message.id} className={`msg ${message.role}`}>
              {groups.map((group, groupIndex) => {
                if (group.type === 'tools') return <ActivityGroup
                  key={group.start}
                  parts={group.parts}
                  onApprove={(id, approved) => addToolApprovalResponse({ id, approved })}
                  showPreview={groupIndex === lastTools}
                  onShowDesktop={machineId ? () => setShowDesktop(true) : undefined}
                />;
                return group.parts.map((part: any, index: number) => part.type === 'text' && part.text
                  ? <div key={`${group.start}-${index}`} className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
                  }}>{part.text}</ReactMarkdown></div>
                  : null);
              })}
            </article>;
          })}
          {busy && <div className="working" role="status"><span className="activity-pulse" aria-hidden="true" /> Mola is working… <span className="muted">Open activity details or show the desktop to follow along.</span></div>}
          {error && <div className="run-error" role="alert">
            <strong>The task was interrupted.</strong>
            <p>{error.message || 'The connection failed. Your conversation and computer are still available.'}</p>
            <button disabled={busy} onClick={() => {
              dismissRunError();
              sendMessage({ text: 'Continue the interrupted task. Inspect the existing work before repeating any actions.' });
            }}>Continue task</button>
          </div>}
          <div ref={bottom} />
        </div>

        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            value={input}
            rows={1}
            placeholder="Message Mola…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
          />
          {busy
            ? <button type="button" className="stop" onClick={stop}>Stop</button>
            : <button type="submit" disabled={!input.trim()}>Send</button>}
        </form>
      </main>}

      {showDesktop && threadId && renderView === 'chat' && (
        <DesktopPanel threadId={threadId} onClose={() => setShowDesktop(false)} />
      )}
    </div>
  );
}
