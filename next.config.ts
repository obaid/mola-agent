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
  // Dynamic file reads must not pull previous bundles or development evidence
  // back into the standalone output on subsequent builds.
  outputFileTracingExcludes: {
    '**': ['./server/**/*', './artifacts/**/*', './test/**/*', './docs/**/*', './*.tgz'],
  },
  devIndicators: false,
};

export default config;
