/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    // Map .js imports to .ts source files (NodeNext resolution uses .js extensions)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        diagnostics: false,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'bundler',
        },
      },
    ],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
  setupFiles: ['./src/auth/__tests__/jest.setup.js'],
};

export default config;
