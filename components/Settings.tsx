// Settings component - Phase 2+3 cloud configuration
'use client';

import { useState, useEffect } from 'react';

type Profile = { id: string; name: string; vcpus: number; memory_mb: number; disk_gb: number; available: boolean };
type Config = {
  backend?: 'local' | 'cloud';
  cloudProfile?: string;
  computerPolicy?: 'per-thread' | 'shared';
  confirmCommands?: boolean;
};

export default function Settings({
  onClose,
}: {
  onClose: () => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const [setupRes, profilesRes] = await Promise.all([
      fetch('/api/setup'),
      fetch('/api/profiles'),
    ]);
    const setup = await setupRes.json();
    const profilesData = await profilesRes.json();
    
    setConfig({
      backend: setup.config.backend ?? 'local',
      cloudProfile: setup.config.cloudProfile,
      computerPolicy: setup.config.computerPolicy ?? 'per-thread',
      confirmCommands: setup.config.confirmCommands ?? false,
    });
    setProfiles(profilesData.profiles ?? []);
  }

  async function save() {
    setBusy(true);
    await fetch('/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!config) {
    return (
      <main className="conversation">
        <header className="bar">
          <strong>Settings</strong>
          <button className="ghost" onClick={onClose}>Close</button>
        </header>
        <div className="messages">
          <p className="muted">Loading…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="conversation">
      <header className="bar">
        <strong>Settings</strong>
        {saved && <span className="muted small">✓ Saved</span>}
        <button className="ghost" onClick={onClose}>Close</button>
      </header>

      <div className="messages">
        <div className="setting-group">
          <h3>Backend</h3>
          <p className="muted small">Where computers run (MOLA_BACKEND env overrides this)</p>
          <div className="setting-options">
            <label>
              <input
                type="radio"
                checked={config.backend === 'local'}
                onChange={() => setConfig({ ...config, backend: 'local' })}
              />
              <span>Local (mola-core)</span>
            </label>
            <label>
              <input
                type="radio"
                checked={config.backend === 'cloud'}
                onChange={() => setConfig({ ...config, backend: 'cloud' })}
              />
              <span>Cloud (cloud.mola.sh)</span>
            </label>
          </div>
        </div>

        {config.backend === 'cloud' && profiles.length > 0 && (
          <div className="setting-group">
            <h3>Default cloud profile</h3>
            <p className="muted small">Computer size for new machines</p>
            <select
              value={config.cloudProfile ?? ''}
              onChange={(e) => setConfig({ ...config, cloudProfile: e.target.value })}
            >
              {!config.cloudProfile && <option value="">Choose profile...</option>}
              {profiles.filter(p => p.available).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.vcpus} vCPU · {(p.memory_mb / 1024).toFixed(0)} GB · {p.disk_gb} GB disk
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="setting-group">
          <h3>Computer policy</h3>
          <p className="muted small">How threads share computers</p>
          <div className="setting-options">
            <label>
              <input
                type="radio"
                checked={config.computerPolicy === 'per-thread'}
                onChange={() => setConfig({ ...config, computerPolicy: 'per-thread' })}
              />
              <span>Per-thread (each conversation gets its own)</span>
            </label>
            <label>
              <input
                type="radio"
                checked={config.computerPolicy === 'shared'}
                onChange={() => setConfig({ ...config, computerPolicy: 'shared' })}
              />
              <span>Shared (one default computer for all)</span>
            </label>
          </div>
        </div>

        <div className="setting-group">
          <h3>Command confirmation</h3>
          <p className="muted small">Approve shell commands before they run</p>
          <label>
            <input
              type="checkbox"
              checked={config.confirmCommands}
              onChange={(e) => setConfig({ ...config, confirmCommands: e.target.checked })}
            />
            <span>Ask before every command</span>
          </label>
        </div>

        <div className="actions">
          <button disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </main>
  );
}
