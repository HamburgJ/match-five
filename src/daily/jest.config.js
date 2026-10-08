// Jest for the daily's pure modules, without CRA's setupTests (which needs
// @testing-library/jest-dom). Run from games/match-five:
//   npx jest --config src/daily/jest.config.js
module.exports = {
  rootDir: '../..',
  roots: ['<rootDir>/src/daily'],
  testEnvironment: 'node',
  transform: {
    '\.[jt]sx?$': ['babel-jest', { presets: [['babel-preset-react-app', { runtime: 'automatic' }]], babelrc: false, configFile: false }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testMatch: ['**/*.test.ts'],
};
