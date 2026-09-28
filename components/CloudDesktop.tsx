'use client';

import { useEffect, useRef, useState } from 'react';
import type RFB from '@novnc/novnc';

type Grant = { relay_url: string };

/** A grant authenticates the connection once; expiry does not end a live socket. */
export default function CloudDesktop({ grant }: { grant: Grant }) {
  const surface = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let connection: RFB | undefined;
    setError(null);
    void import('@novnc/novnc').then(({ default: RFB }) => {
      if (cancelled || !surface.current) return;
      connection = new RFB(surface.current, grant.relay_url);
      connection.scaleViewport = true;
      connection.resizeSession = false;
      connection.focusOnClick = true;
      connection.addEventListener('securityfailure', () => {
        if (!cancelled) setError('The desktop ticket was rejected. Press Reconnect.');
      });
      connection.addEventListener('disconnect', () => {
        if (!cancelled) setError('Desktop disconnected. Press Reconnect to get a new ticket.');
      });
    }).catch(() => {
      if (!cancelled) setError('The desktop connection could not be opened. Press Reconnect.');
    });
    return () => { cancelled = true; connection?.disconnect(); };
  }, [grant]);

  return <>
    {error && <p className="error pad">{error}</p>}
    <div ref={surface} className="cloud-desktop" aria-label="Cloud computer desktop" />
  </>;
}
