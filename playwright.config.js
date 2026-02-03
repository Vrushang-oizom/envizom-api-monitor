const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,

  use: {
    browserName: 'chromium',
    headless: true,           // 🔥 REQUIRED for GitHub Actions
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },

  workers: 1,                // safer for monitoring
});
