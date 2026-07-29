import {defineConfig} from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['../../../../tsconfig.json'],
    }),
    swc.vite({
      sourceMaps: true,
      jsc: {
        target: 'es2022',
        externalHelpers: false,
        keepClassNames: true,
        parser: {
          syntax: 'typescript',
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
    include: ['*.integration.test.ts'],
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
