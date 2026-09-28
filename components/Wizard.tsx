'use client';

import { useState, useEffect } from 'react';

const PROVIDERS = [
  { id: 'anthropic', label: 'Claude (Anthropic)', hint: 'sk-ant-…', url: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', hint: 'sk-…', url: 'https://platform.openai.com/api-keys' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'sk-or-…', url: 'https://openrouter.ai/keys' },
];

type Model = { id: string; label: string; note?: string };
type Profile = { id: string; name: string; vcpus: number; memory_mb: number; disk_gb: number; available: boolean };
type Backend = { ok: boolean; detail: string; backend: 'local' | 'cloud' };

export default function Wizard({
  backend,
  onDone,
}: {
  backend: Backend;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'backend' | 'provider' | 'model' | 'profile'>('backend');
  const [selectedBackend, setSelectedBackend] = useState<'local' | 'cloud'>(backend.backend);
  const [provider, setProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<Model[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBackend === 'cloud') {
      loadProfiles();
    }
  }, [selectedBackend]);

  async function loadProfiles() {
    try {
      const response = await fetch('/api/profiles');
      const body = await response.json();
      if (response.ok) {
        setProfiles(body.profiles ?? []);
      }
    } catch (e) {
      // Profiles optional, continue without
    }
  }

  async function loadModels() {
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setModels(body.models);
      setStep('model');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function choose(model: string, cloudProfile?: string) {
    setBusy(true);
    await fetch('/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 
        provider, 
        apiKey, 
        model, 
        backend: selectedBackend,
        cloudProfile,
      }),
    });
    onDone();
  }

  async function chooseProfile(profileId: string) {
    if (models && models.length > 0) {
      await choose(models[0].id, profileId);
    }
  }

  const backendOk = selectedBackend === 'local' 
    ? backend.backend === 'local' && backend.ok
    : backend.backend === 'cloud' && backend.ok;

  return (
    <main className="wizard">
      <h1>mola<span className="dot">.</span>agent</h1>
      <p className="muted">An agent with a real computer. A few things to set up.</p>

      {/* Step 1: Backend selection */}
      <section className={`step ${step === 'backend' ? 'active' : step === 'provider' || step === 'model' || step === 'profile' ? 'ok' : ''}`}>
        <header>
          <span className="num">1</span>
          <strong>Backend</strong>
          {step !== 'backend' && <span className="tick">chosen</span>}
        </header>
        {step === 'backend' && (
          <>
            <p className="muted">Run computers locally or in the cloud</p>
            <div className="providers">
              <button
                className={selectedBackend === 'local' ? 'pick chosen' : 'pick'}
                onClick={() => setSelectedBackend('local')}
              >
                Local (mola-core)
              </button>
              <button
                className={selectedBackend === 'cloud' ? 'pick chosen' : 'pick'}
                onClick={() => setSelectedBackend('cloud')}
              >
                Cloud (cloud.mola.sh)
              </button>
            </div>
            <div className={`status ${backendOk ? 'ok' : 'bad'}`}>
              <span className={backendOk ? 'tick' : 'cross'}>{backendOk ? 'ready' : 'not ready'}</span>
              <p className="muted">{backend.detail}</p>
            </div>
            {selectedBackend === 'local' && !backendOk && (
              <p className="muted">
                Start the engine in a terminal: <code>npx mola-core</code> and reload.
              </p>
            )}
            {selectedBackend === 'cloud' && !backendOk && (
              <p className="muted">
                Set MOLA_TOKEN environment variable. Get one from <a href="https://cloud.mola.sh" target="_blank" rel="noreferrer">cloud.mola.sh</a>
              </p>
            )}
            {backendOk && (
              <button className="go" onClick={() => setStep('provider')}>Continue</button>
            )}
          </>
        )}
      </section>

      {/* Step 2: Provider & API key */}
      <section className={`step ${step === 'provider' ? 'active' : step === 'model' || step === 'profile' ? 'ok' : ''}`}>
        <header>
          <span className="num">2</span>
          <strong>Model provider</strong>
          {(step === 'model' || step === 'profile') && <span className="tick">chosen</span>}
        </header>

        {step === 'provider' && (
          <>
            <div className="providers">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={provider === p.id ? 'pick chosen' : 'pick'}
                  onClick={() => { setProvider(p.id); setModels(null); setError(null); }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {provider && !models && (
              <div className="key">
                <input
                  type="password"
                  value={apiKey}
                  placeholder={PROVIDERS.find((p) => p.id === provider)!.hint}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && apiKey) loadModels(); }}
                  autoFocus
                />
                <button className="go" disabled={!apiKey || busy} onClick={loadModels}>
                  {busy ? 'checking…' : 'Continue'}
                </button>
                <p className="muted small">
                  Stored at <code>~/.mola-agent/config.json</code>, mode 0600. It stays on this
                  machine and never reaches the browser again.{' '}
                  <a href={PROVIDERS.find((p) => p.id === provider)!.url} target="_blank" rel="noreferrer">
                    Get a key
                  </a>
                </p>
              </div>
            )}

            {error && <p className="error">{error}</p>}
          </>
        )}
      </section>

      {/* Step 3: Model selection */}
      {step === 'model' && models && (
        <section className="step active">
          <header><span className="num">3</span><strong>Model</strong></header>
          <p className="muted small">
            {models.length} model{models.length === 1 ? '' : 's'} that can both call tools and
            see the screen.
          </p>
          <ul className="models">
            {models.map((m) => (
              <li key={m.id}>
                <button disabled={busy} onClick={() => {
                  if (selectedBackend === 'cloud' && profiles && profiles.length > 1) {
                    setStep('profile');
                  } else {
                    choose(m.id, profiles?.[0]?.id);
                  }
                }}>
                  <span>{m.label}</span>
                  {m.note && <em>{m.note}</em>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Step 4: Cloud profile selection (cloud only) */}
      {step === 'profile' && profiles && profiles.length > 0 && (
        <section className="step active">
          <header><span className="num">4</span><strong>Computer profile</strong></header>
          <p className="muted small">
            Choose default computer size for cloud machines
          </p>
          <ul className="models">
            {profiles.filter(p => p.available).map((p) => (
              <li key={p.id}>
                <button disabled={busy} onClick={() => chooseProfile(p.id)}>
                  <span>{p.name}</span>
                  <em>{p.vcpus} vCPU · {(p.memory_mb / 1024).toFixed(0)} GB · {p.disk_gb} GB disk</em>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
