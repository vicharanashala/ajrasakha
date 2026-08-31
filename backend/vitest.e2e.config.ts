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
    include: ['src/**/*.e2e.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/e2e',
      reporter: [['html', {subdir: 'html'}], 'json', 'text'],
      // Without this, vitest silently skips writing ANY coverage report
      // (no text, no json, no html) the moment a single test fails — and
      // this suite has 2 known, documented, permanently-failing tests
      // (see Failed_tests.md), so coverage would never generate otherwise.
      reportOnFailure: true,
      // Only count application code, not the e2e test files themselves —
      // otherwise "coverage" just measures that the test files ran.
      include: ['src/modules/**', 'src/shared/**'],
      // QuestionService_copy.ts is an 11,431-line legacy snapshot with zero
      // imports anywhere in the codebase (verified via repo-wide grep) — not
      // reachable by any route or test. Left in place (its history suggests
      // it's an intentional reference copy, not litter to delete), but
      // counting its ~9,200 never-touched lines against coverage understates
      // the real number by ~7 points overall (question/services alone reports
      // ~32% with it included vs. ~60% without). Excluded from measurement
      // only, not from the build.
      exclude: [
        'src/**/tests/**',
        'src/e2e/**',
        'src/**/*.d.ts',
        'src/modules/question/services/QuestionService_copy.ts',
        // Bound in the DI container but never injected into any controller
        // or reachable service — UserService reimplements the same
        // agent-assignment logic inline instead of calling this. Verified
        // via repo-wide grep; nothing routes to it. See README.md.
        'src/modules/plivo/services/AgentAssignmentService.ts',
      ],
    },
  },
});
