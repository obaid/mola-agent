import sharp from 'sharp';
import type { Shot } from './media';

export const SCREEN = { width: 1280, height: 800 };
export const SENT = { width: 1024, height: 640 };

/** Keep the image the model sees and its input coordinates in one space. */
export async function prepareScreen(data: string) {
  const source = sharp(Buffer.from(data, 'base64'));
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new Error('The screenshot has no dimensions.');
  const resized = await source.resize(SENT.width, SENT.height, { fit: 'fill' }).png().toBuffer();
  return {
    screen: { width: metadata.width, height: metadata.height },
    shot: { mediaType: 'image/png', data: resized.toString('base64') } satisfies Shot,
  };
}

export function screenPoint(value: number, axis: 'width' | 'height', screen = SCREEN) {
  if (!Number.isInteger(value) || value < 0 || value >= SENT[axis]) {
    throw new Error(`${axis} coordinate must be between 0 and ${SENT[axis] - 1}. Take a fresh screenshot and use its coordinates.`);
  }
  return Math.round(value * screen[axis] / SENT[axis]);
}
