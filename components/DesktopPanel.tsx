'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The live desktop, beside the conversation.
 *
 * The engine's viewer is a separate origin, which is fine because it loads as a
 * document rather than a fetch, so CORS does not apply. It also means we cannot
 * see inside it: when its socket drops, the iframe prints its own message and
 * we learn nothing.
 *
 * So reconnection is driven from the outside. A ticket is single use and lives
 * sixty seconds, which is the right design (it is a capability, not a session)
 * and is why a longer-lived link would not help: it is spent the moment noVNC
 * connects. What matters is noticing that the machine went away and coming back
 * when it returns.
 */

const HEARTBEAT_MS = 30_000;

export default function DesktopPanel({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('unknown');
  const previous = useRef<string>('unknown');

  const mint = useCallback(async () => {
    setError(null);
    setUrl(null);
    const response = await fetch('/api/desktop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error); return; }
    // No cache-busting parameter: the ticket lives in the URL *fragment*, so
    // anything appended lands inside it and the viewer reads a corrupted
    // ticket. Every mint is a new random ticket anyway, so the URL already
    // differs, and `key={url}` remounts the iframe.
    setUrl(body.url);
    
    // Cloud sessions need refresh; local tickets are single-use
    if (body.needsRefresh && body.refreshAfter) {
      const delay = body.refreshAfter - Date.now();
      if (delay > 0) {
        setTimeout(() => void mint(), delay);
      }
    }
  }, [threadId]);

  useEffect(() => { void mint(); }, [mint]);

  /**
   * Tell the server somebody is watching, and find out whether the machine is
   * still there. A machine that stopped and came back gets a fresh ticket
   * automatically, because asking a person to press Reconnect for something we
   * can see happening is just making them do our job.
   */
  useEffect(() => {
    let cancelled = false;

    const beat = async () => {
      const response = await fetch('/api/watching', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId }),
      }).catch(() => null);
      if (!response || cancelled) return;

      const { status: now } = await response.json();
      setStatus(now);
      if (previous.current !== 'ready' && now === 'ready') void mint();
      previous.current = now;
    };

    void beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [threadId, mint]);

  const note = status === 'ready' ? 'live · your mouse and keyboard work here'
    : status === 'stopped' ? 'the machine is stopped; it starts again on the next message'
      : status === 'booting' ? 'starting…'
        : 'checking…';

  return (
    <aside className="desktop">
      <header className="bar">
        <strong>Desktop</strong>
        <span className="muted small">{note}</span>
        <button className="ghost" onClick={() => void mint()}>Reconnect</button>
        <button className="ghost" onClick={onClose}>Close</button>
      </header>
      {error && <p className="error pad">{error}</p>}
      {url && (
        <iframe
          key={url}
          src={url}
          title="The machine's desktop"
          allow="clipboard-read; clipboard-write"
        />
      )}
      {!url && !error && <p className="muted pad">Connecting…</p>}
    </aside>
  );
}
