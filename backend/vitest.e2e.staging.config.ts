import {defineConfig} from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

// Dedicated config for e2e tests.
//
// Key differences from vite.config.ts:
//   pool: 'forks'        — each file runs in its own child process, so module
//                          singletons (MongoDatabase, loadAppModules cache) are
//                          never shared between files. Without this, an afterAll
//                          that calls db.disconnect() in one file corrupts the
//                          shared Mongo singleton for every file that runs after it.
//   fileParallelism:false — files run one at a time. The e2e suite shares a live
//                          Atlas DB; parallel cron calls in different files would
//                          race on the same STF expert pool and cause spurious
//                          "0 allocated" failures.
//   hookTimeout: 120_000  — beforeAll setups boot the full DI container + make DB
//                          queries; 30 s is too tight under Atlas cold-start.
export default defineConfig({
  plugins: [
    tsconfigPaths(),
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
      'src/**/*.e2e.test.ts',
      '!src/e2e/auto-allocation/**',
      '!src/e2e/allocation-ordering/**',
    ],
    pool: 'forks',
    fileParallelism: false,
    hookTimeout: 120_000,
  },
});
