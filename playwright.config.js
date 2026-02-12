const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 240000,
  workers: 1,
  use: {
  headless: false,
  slowMo: 500
}
});

