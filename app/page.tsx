'use client';

import { useEffect, useState } from 'react';
import Wizard from '@/components/Wizard';
import Chat from '@/components/Chat';

type Setup = {
  config: { 
    configured: boolean; 
    provider?: string; 
    model?: string; 
    keyHint: string | null;
    backend?: 'local' | 'cloud';
    hasCloudToken?: boolean;
  };
  backend: { ok: boolean; detail: string; backend: 'local' | 'cloud' };
};

export default function Page() {
  const [setup, setSetup] = useState<Setup | null>(null);

  const refresh = () => fetch('/api/setup').then((r) => r.json()).then(setSetup);
  useEffect(() => { refresh(); }, []);

  if (!setup) {
    return <main className="centre"><p className="muted">Starting…</p></main>;
  }

  if (!setup.config.configured) {
    return <Wizard backend={setup.backend} onDone={refresh} />;
  }

  return <Chat model={setup.config.model!} provider={setup.config.provider!} backend={setup.config.backend!} />;
}
