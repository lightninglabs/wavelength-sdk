const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'storage.spec.cjs',
  timeout: 120000,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'node smoke-server.js',
    cwd: require('node:path').resolve(__dirname, '..'),
    env: { HOST: '127.0.0.1', PORT: '8806' },
    url: 'http://127.0.0.1:8806/v1/ark/get-info',
    reuseExistingServer: false,
  },
});
