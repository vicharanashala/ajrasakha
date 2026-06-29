import {defineConfig} from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(), // ← picks up your tsconfig.json “paths” mappings
    // This is required to build the test files with SWC
    swc.vite({
      sourceMaps: true,

      jsc: {
        target: 'es2022',
        externalHelpers: true,
        keepClassNames: true,
        parser: {
          syntax: 'typescript',
          tsx: true,
          decorators: true,
          dynamicImport: true,
        },
        transform: {
          useDefineForClassFields: false,
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
      module: {
        type: 'es6',
        strictMode: true,
        lazy: false,
        noInterop: false,
      },
      isModule: true,
    }),
  ],
  test: {
    environment: 'node',
    include: [
      'src/**/*.unit.test.ts',
      'src/**/*.integration.test.ts',
      'src/**/*.api.test.ts',
      'src/**/*.e2e.test.ts',
    ],
    // e2e tests share a real Atlas DB; parallel forks race on shared state and
    // produce non-deterministic failures. Serialise to 1 fork at a time.
    poolOptions: {
      forks: {
        maxForks: 1,
      },
    },
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: [['html', {subdir: 'html'}], 'json', 'text'],
    },
  },
});
