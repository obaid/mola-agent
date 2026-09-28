import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { desktopRelayUrl, startDesktopRelay } from '../bin/cloud-desktop.js';

const secret = 'private-test-secret';
const origin = 'http://127.0.0.1:3939';
const grant = { ws_url: 'wss://computer.mola.sh/desktop', token: 'fixture-grant', expires_in: 60 };

test('the loopback desktop relay transfers binary VNC traffic in both directions', async (t) => {
  const gateway = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(gateway, 'listening');
  gateway.on('connection', (socket) => {
    socket.send(Buffer.from('RFB 003.008\n'));
    socket.on('message', (data) => socket.send(data));
  });
  const relay = await startDesktopRelay({ secret, origin, cloudOrigin: 'https://cloud.mola.sh', connect: (url) => {
    assert.equal(new URL(url).searchParams.get('token'), 'fixture-grant');
    return new WebSocket(`ws://127.0.0.1:${gateway.address().port}`);
  } });
  t.after(() => { relay.close(); gateway.close(); });
  const socket = new WebSocket(desktopRelayUrl(grant, relay.url, secret), { origin });
  t.after(() => socket.terminate());
  const [hello] = await once(socket, 'message');
  assert.equal(hello.toString(), 'RFB 003.008\n');
  const reply = once(socket, 'message');
  socket.send(Buffer.from([1, 2, 3, 255]));
  assert.deepEqual((await reply)[0], Buffer.from([1, 2, 3, 255]));
});

test('the relay rejects foreign origins, tampered tickets and expired grants before upstream access', async (t) => {
  let connections = 0;
  const relay = await startDesktopRelay({ secret, origin, connect: () => { connections++; assert.fail('unauthorized upstream connection'); } });
  t.after(() => relay.close());
  const valid = desktopRelayUrl(grant, relay.url, secret);
  for (const [url, requestOrigin] of [
    [valid, 'https://untrusted.example'],
    [desktopRelayUrl(grant, relay.url, 'wrong-secret'), origin],
    [desktopRelayUrl({ ...grant, expires_in: -1 }, relay.url, secret), origin],
  ]) {
    const socket = new WebSocket(url, { origin: requestOrigin });
    const error = await new Promise(resolve => socket.once('error', resolve));
    assert.match(error.message, /403/);
    socket.terminate();
  }
  assert.equal(connections, 0);
});
