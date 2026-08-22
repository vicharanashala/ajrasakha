import {defineConfig} from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    swc.vite({
      sourceMaps: true,
      jsc: {
        target: 'es2022',
        externalHelpers: true,
        keepClassNames: true,
        parser: { syntax: 'typescript', tsx: true, decorators: true, dynamicImport: true },
        transform: { useDefineForClassFields: false, legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: 'es6', strictMode: true, lazy: false, noInterop: false },
      isModule: true,
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.e2e.test.ts'],
    exclude: ['src/e2e/auto-allocation/**', 'src/e2e/allocation-ordering/**'],
    pool: 'forks',
    fileParallelism: false,
    hookTimeout: 120_000,
    reporters: ['verbose', 'html'],
    outputFile: { html: './test-results/index.html' },
  },
});