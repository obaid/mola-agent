import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';

export function desktopRelayUrl(grant, relayUrl, secret) {
  const expires = Date.now() + grant.expires_in * 1000;
  const payload = Buffer.from(JSON.stringify({ ...grant, expires })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  const url = new URL(relayUrl);
  url.searchParams.set('ticket', `${payload}.${signature}`);
  return url.href;
}

export async function startDesktopRelay({ secret, origin, cloudOrigin, connect = (url) => new WebSocket(url, { origin: cloudOrigin, handshakeTimeout: 10_000 }) }) {
  const server = createServer((_, response) => { response.writeHead(404); response.end(); });
  const clients = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const reject = () => { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); };
    let target;
    try {
      if (request.headers.origin && request.headers.origin !== origin) return reject();
      if (request.headers.host !== `127.0.0.1:${server.address().port}`) return reject();
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname !== '/desktop') return reject();
      const [payload, signature] = (url.searchParams.get('ticket') || '').split('.');
      const expected = createHmac('sha256', secret).update(payload).digest();
      const supplied = Buffer.from(signature || '', 'base64url');
      if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return reject();
      const grant = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (!Number.isFinite(grant.expires) || grant.expires < Date.now()) return reject();
      target = new URL(grant.ws_url);
      if (target.protocol !== 'wss:' || target.username || target.password || !grant.token) return reject();
      target.searchParams.set('token', grant.token);
    } catch { return reject(); }

    clients.handleUpgrade(request, socket, head, (downstream) => {
      let upstream;
      try { upstream = connect(target.href); } catch { downstream.close(1011); return; }
      upstream.on('message', (data, binary) => {
        if (downstream.readyState === WebSocket.OPEN) downstream.send(data, { binary });
      });
      downstream.on('message', (data, binary) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary });
      });
      upstream.on('error', () => downstream.close(1011));
      upstream.on('close', () => downstream.close());
      downstream.on('error', () => upstream.terminate());
      downstream.on('close', () => upstream.terminate());
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `ws://127.0.0.1:${server.address().port}/desktop`,
    close: () => { for (const client of clients.clients) client.terminate(); clients.close(); server.close(); },
  };
}
