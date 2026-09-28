/**
 * Changes:
 * 2026-09-16: Backend factory for selecting local vs cloud based on MOLA_BACKEND env var
 */

import type { ComputerBackend } from './backend';
import { LocalCoreBackend } from './local';
import { CloudMolaBackend } from './cloud';

/**
 * Create the appropriate backend based on MOLA_BACKEND environment variable.
 *
 * - MOLA_BACKEND=local (default): Use local mola-core
 * - MOLA_BACKEND=cloud: Use cloud.mola.sh
 */
export function createBackend(): ComputerBackend {
  const backend = process.env.MOLA_BACKEND || 'local';

  switch (backend) {
    case 'local':
      return new LocalCoreBackend();
    case 'cloud':
      return new CloudMolaBackend();
    default:
      throw new Error(`Unknown MOLA_BACKEND: ${backend}. Use "local" or "cloud".`);
  }
}
