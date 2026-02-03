const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    timeout: 120000, // 2 minutes per test

    use: {
        headless: false,      // 👀 SEE THE BROWSER
        slowMo: 500,          // 🐢 Slow down actions
        viewport: null,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },

    reporter: [['list'], ['html']]
});
