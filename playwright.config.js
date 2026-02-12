const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 120000,
  workers: 1,
  use: {
    headless: true
  }
});
