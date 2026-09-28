import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prepareScreen, screenPoint } from '../lib/screen.ts';

test('a native screenshot is really resized to the advertised model coordinate space', async () => {
  const png = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#fff' } }).png().toBuffer();
  const result = await prepareScreen(png.toString('base64'));
  assert.deepEqual(result.screen, { width: 1920, height: 1080 });
  const shown = await sharp(Buffer.from(result.shot.data, 'base64')).metadata();
  assert.equal(shown.width, 1024);
  assert.equal(shown.height, 640);
  assert.equal(screenPoint(512, 'width', result.screen), 960);
  assert.equal(screenPoint(320, 'height', result.screen), 540);
  assert.throws(() => screenPoint(1085, 'width'), /fresh screenshot/);
});
