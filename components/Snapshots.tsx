// Snapshots management component - Phase 3.1
'use client';

import { useState, useEffect } from 'react';

type Snapshot = {
  id: string;
  name: string;
  status: string;
  size_gb?: number;
  created_at: string;
};

function age(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function Snapshots({
  computerId,
  onClose,
}: {
  computerId: string | null;
  onClose: () => void;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (computerId) {
      refresh();
    }
  }, [computerId]);

  async function refresh() {
    if (!computerId) return;
    
    try {
      const response = await fetch(`/api/snapshots?computerId=${encodeURIComponent(computerId)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSnapshots(body.snapshots ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
      setSnapshots([]);
    }
  }

  async function create() {
    if (!computerId || !newName.trim()) return;
    
    setBusy('create');
    setError(null);
    try {
      const response = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ computerId, name: newName.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      
      setNewName('');
      setCreating(false);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function restore(snapshotId: string) {
    if (!computerId) return;
    
    setBusy(snapshotId);
    setError(null);
    try {
      const response = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ computerId, action: 'restore', snapshotId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteSnapshot(snapshotId: string) {
    if (!computerId) return;
    
    setBusy(snapshotId);
    setError(null);
    try {
      const response = await fetch(`/api/snapshots?computerId=${encodeURIComponent(computerId)}&snapshotId=${encodeURIComponent(snapshotId)}`, {
        method: 'DELETE',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      
      setConfirming(null);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!computerId) {
    return (
      <main className="conversation">
        <header className="bar">
          <strong>Snapshots</strong>
          <button className="ghost" onClick={onClose}>Close</button>
        </header>
        <div className="messages">
          <p className="muted">No computer selected.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="conversation">
      <header className="bar">
        <strong>Snapshots</strong>
        <span className="muted small">
          {snapshots === null ? 'loading…' : `${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}`}
        </span>
        <button className="ghost" onClick={() => void refresh()}>Refresh</button>
        <button onClick={() => setCreating(true)}>Create snapshot</button>
        <button className="ghost" onClick={onClose}>Close</button>
      </header>

      <div className="messages">
        {error && <p className="error">{error}</p>}

        {creating && (
          <div className="snapshot-form">
            <h3>Create snapshot</h3>
            <p className="muted small">
              The computer will be stopped before the snapshot is taken.
            </p>
            <input
              type="text"
              value={newName}
              placeholder="Snapshot name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) create(); }}
              autoFocus
            />
            <div className="actions">
              <button disabled={!newName.trim() || busy === 'create'} onClick={create}>
                {busy === 'create' ? 'Creating…' : 'Create'}
              </button>
              <button className="ghost" onClick={() => { setCreating(false); setNewName(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {snapshots !== null && snapshots.length === 0 && !error && (
          <p className="muted">No snapshots yet. Create one to save the current state.</p>
        )}

        {(snapshots ?? []).map((snapshot) => {
          const working = busy === snapshot.id;
          return (
            <div key={snapshot.id} className="snapshot-card">
              <div className="who">
                <strong>{snapshot.name}</strong>
                <span className={`badge ${snapshot.status === 'ready' ? 'live' : snapshot.status === 'creating' ? '' : 'bad'}`}>
                  {snapshot.status}
                </span>
              </div>

              <p className="muted small">
                {snapshot.size_gb && `${snapshot.size_gb} GB · `}
                {age(snapshot.created_at)}
                {' · '}
                <code className="muted">{snapshot.id.slice(0, 8)}</code>
              </p>

              {confirming === snapshot.id ? (
                <div className="actions">
                  <span className="muted small">Delete this snapshot? Cannot be undone.</span>
                  <button disabled={working} className="danger" onClick={() => deleteSnapshot(snapshot.id)}>
                    Delete
                  </button>
                  <button className="ghost" onClick={() => setConfirming(null)}>Cancel</button>
                </div>
              ) : (
                <div className="actions">
                  {snapshot.status === 'ready' && (
                    <button className="ghost" disabled={working} onClick={() => restore(snapshot.id)}>
                      Restore
                    </button>
                  )}
                  <button className="ghost danger" disabled={working} onClick={() => setConfirming(snapshot.id)}>
                    Delete
                  </button>
                  {working && <span className="spin" aria-label="working" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
