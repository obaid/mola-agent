import type { NextConfig } from 'next';

/**
 * `standalone` emits a self-contained server with only the modules it actually
 * uses. Sharp is installed by npm on the user's platform rather than shipping
 * the build machine's native binary. Production uses Webpack to avoid
 * Turbopack's generated external aliases being dropped by npm pack.
 */
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  devIndicators: false,
};

export default config;
