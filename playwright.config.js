const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 120000,
  use: {
    headless: true   // REQUIRED for GitHub Actions
  }
});

