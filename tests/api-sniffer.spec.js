const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom Full Flow → Login → AQI → Capture APIs', async ({ page }) => {

  const loginApis = [];
  const aqiApis = [];

  let phase = 'login';

  /* =========================
     HELPER: CLOSE OVERLAY
  ========================= */
  async function closeOverlay() {
    const overlay = page.locator('.cdk-overlay-backdrop');
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ force: true });
      await page.waitForTimeout(1500);
    }
  }

  /* =========================
     CAPTURE ALL API CALLS
  ========================= */
  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('envdevapi.oizom.com')) {
      const apiData = {
        time: new Date().toLocaleString(),
        url,
        status: response.status(),
        method: response.request().method()
      };

      if (phase === 'login') {
        loginApis.push(apiData);
      } else {
        aqiApis.push(apiData);
      }
    }
  });

  /* =========================
     1️⃣ OPEN LOGIN PAGE
  ========================= */
  await page.goto('https://devenvizom.oizom.com/#/login');

  /* =========================
     2️⃣ LOGIN
  ========================= */
  await page.getByPlaceholder(/email/i)
    .fill(process.env.ENVIZOM_EMAIL);

  await page.getByPlaceholder(/password/i)
    .fill(process.env.ENVIZOM_PASSWORD);

  await page.locator('mat-checkbox').click({ force: true });

  await page.getByRole('button', { name: /agree/i }).click();

  await page.waitForFunction(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim() === 'LOG IN');
    return btn && !btn.disabled;
  });

  await page.locator('button:has-text("LOG IN")').click();

  /* =========================
     WAIT FOR DASHBOARD
  ========================= */
  await page.waitForURL(/overview\/map/, { timeout: 60000 });
  await page.waitForTimeout(5000);

  /* =========================
     CLOSE POPUPS AFTER LOGIN
  ========================= */
  const closeIcons = page.locator('mat-icon:has-text("close")');

  if (await closeIcons.count() > 0) {
    try {
      await closeIcons.first().click({ force: true });
      await page.waitForTimeout(2000);
    } catch {}
  }

  await closeOverlay();

  /* =========================
     SWITCH TO AQI PHASE
  ========================= */
  phase = 'aqi';

  /* =========================
     3️⃣ CLICK AQI VIEW
  ========================= */
  await closeOverlay();

  await page.locator('text=AQI View').first().click({ force: true });

  await page.waitForURL(/overview\/aqi/, { timeout: 60000 });
  await page.waitForTimeout(6000);

  await closeOverlay();

  /* =========================
     4️⃣ SELECT DEVICE TYPE
  ========================= */
  const deviceTypeInput = page.locator('input[placeholder="Device Type"]');

  if (await deviceTypeInput.isVisible().catch(() => false)) {
    await deviceTypeInput.click();
    await page.waitForTimeout(2000);

    const firstOption = page.locator('mat-option').first();
    if (await firstOption.isVisible().catch(() => false)) {
      await firstOption.click();
    }
  }

  await page.waitForTimeout(2000);

  /* =========================
     5️⃣ SELECT TODAY DATE
  ========================= */
  const dateInput = page.locator('input[formcontrolname="startDate"]');

  if (await dateInput.isVisible().catch(() => false)) {
    await dateInput.click();
    await page.waitForTimeout(2000);

    const today = page.locator('.mat-calendar-body-cell-content').last();
    if (await today.isVisible().catch(() => false)) {
      await today.click();
    }
  }

  await page.waitForTimeout(2000);

  /* =========================
     6️⃣ SELECT TIME (PREVIOUS HOUR)
  ========================= */
  const timeInput = page.locator('input[formcontrolname="selectedTime"]');

  if (await timeInput.isVisible().catch(() => false)) {
    await timeInput.click();
    await page.waitForTimeout(3000);

    const now = new Date();
    let hour = now.getHours() - 1;
    if (hour <= 0) hour = 12;
    if (hour > 12) hour -= 12;

    const hourLocator = page.locator('.clock-face span', {
      hasText: hour.toString()
    });

    if (await hourLocator.first().isVisible().catch(() => false)) {
      await hourLocator.first().click();
    }

    await page.getByRole('button', { name: /ok/i }).click();
  }

  await page.waitForTimeout(2000);

  /* =========================
     7️⃣ CLICK APPLY
  ========================= */
  const applyBtn = page.getByRole('button', { name: /apply/i });

  if (await applyBtn.isVisible().catch(() => false)) {
    await applyBtn.click();
  }

  /* =========================
     WAIT FOR AQI APIs
  ========================= */
  await page.waitForTimeout(15000);

  /* =========================
     8️⃣ GENERATE HTML REPORT
  ========================= */
  const html = `
  <html>
  <head>
    <title>Envizom API Monitor</title>
    <style>
      body { font-family: Arial; padding: 20px; }
      h2 { margin-top: 30px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 8px; }
      th { background: #333; color: #fff; }
      .ok { color: green; font-weight: bold; }
      .fail { color: red; font-weight: bold; }
    </style>
  </head>
  <body>

    <h1>Envizom API Health Report</h1>
    <p><b>Last Run:</b> ${new Date().toLocaleString()}</p>

    <h2>LOGIN APIs</h2>
    <table>
      <tr><th>Time</th><th>Method</th><th>URL</th><th>Status</th></tr>
      ${loginApis.map(api => `
        <tr>
          <td>${api.time}</td>
          <td>${api.method}</td>
          <td>${api.url}</td>
          <td class="${api.status === 200 ? 'ok' : 'fail'}">${api.status}</td>
        </tr>
      `).join('')}
    </table>

    <h2>OVERVIEW AQI MODULE APIs</h2>
    <table>
      <tr><th>Time</th><th>Method</th><th>URL</th><th>Status</th></tr>
      ${aqiApis.map(api => `
        <tr>
          <td>${api.time}</td>
          <td>${api.method}</td>
          <td>${api.url}</td>
          <td class="${api.status === 200 ? 'ok' : 'fail'}">${api.status}</td>
        </tr>
      `).join('')}
    </table>

  </body>
  </html>
  `;

  fs.writeFileSync('docs/index.html', html);

  console.log('✅ API report generated');
});
