import type { NextConfig } from 'next';

/**
 * `standalone` emits a self-contained server with only the modules it actually
 * uses, which is what lets the published package declare no runtime
 * dependencies at all. `npx mola-agent` then installs one tarball and
 * nothing else.
 */
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  devIndicators: false,
};

export default config;
