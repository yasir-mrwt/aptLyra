/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          // Force CommonJS for Jest so we don't need experimental ESM flags
          module: 'CommonJS',
        },
      },
    ],
  },
  moduleNameMapper: {
    // Map .js imports (used in your project) back to .ts for Jest
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
