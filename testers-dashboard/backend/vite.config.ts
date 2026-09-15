import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc'
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors ../../backend/vite.config.ts - decorator metadata (inversify,
// routing-controllers) needs the same SWC transform there.
export default defineConfig({
  // Vitest's root otherwise defaults to process.cwd() rather than this
  // config file's own directory, so `pnpm run test:testers-dashboard`
  // (invoked from backend/, see backend/package.json) would pick up
  // backend/src's own tests instead of this package's. Pin it explicitly.
  root: __dirname,
  plugins: [
    tsconfigPaths(),
    swc.vite({
      sourceMaps: true,

      jsc: {
        target: "es2022",
        externalHelpers: true,
        keepClassNames: true,
        parser: {
          syntax: "typescript",
          tsx: true,
          decorators: true,
          dynamicImport: true,
        },
        transform: {
          useDefineForClassFields: false,
          legacyDecorator: true,
          decoratorMetadata: true
        }
      },
      module: {
        type: "es6",
        strictMode: true,
        lazy: false,
        noInterop: false
      },
      isModule: true
    })
  ],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['build/**', 'node_modules/**'],
    hookTimeout: 30000,
    env: {
      // The CSV never moved (see plan) - pin this explicitly so the tests
      // find it regardless of which directory vitest is invoked from.
      TESTERS_DASHBOARD_CSV_PATH: path.resolve(
        __dirname,
        '../../backend/data/testers-dashboard/updated.csv',
      ),
    },
  }
});
