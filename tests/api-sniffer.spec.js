const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('Envizom API Monitor', async ({ page }) => {
  const capturedApis = {};
  const startTime = new Date().toISOString();

  page.on('response', async (response) => {
    const url = response.url();

    if (!url.includes('envdevapi.oizom.com')) return;

    const method = response.request().method();
    const key = `${method} ${url.split('?')[0]}`;

    capturedApis[key] = {
      method,
      url,
      status: response.status(),
      ok: response.status() === 200
    };
  });

  // LOGIN
  await page.goto('https://devenvizom.oizom.com/#/login');

  await page.getByPlaceholder(/email/i).fill(process.env.ENVIZOM_EMAIL);
  await page.getByPlaceholder(/password/i).fill(process.env.ENVIZOM_PASSWORD);

  await page.locator('mat-checkbox').click({ force: true });
  await page.getByRole('button', { name: /agree/i }).click();

  await page.waitForFunction(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim() === 'LOG IN');
    return btn && !btn.disabled;
  });

  await page.click('button:has-text("LOG IN")');

  // Let all APIs fire
  await page.waitForTimeout(15000);

  const output = {
    lastRun: startTime,
    totalApis: Object.keys(capturedApis).length,
    apis: Object.values(capturedApis)
  };

  fs.writeFileSync(
    path.join(__dirname, '../docs/apis.json'),
    JSON.stringify(output, null, 2)
  );
});
