const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('Envizom Full Flow → Login → AQI → Capture APIs', async ({ page }) => {
  test.setTimeout(240000);

  const loginApis = [];
  const aqiApis = [];

  let phase = 'login';

  /* =========================
     CAPTURE ALL NETWORK CALLS
  ========================= */
  page.on('response', async (response) => {
    const url = response.url();

    if (!url.includes('envdevapi.oizom.com')) return;

    const data = {
      url,
      method: response.request().method(),
      status: response.status(),
      time: new Date().toLocaleTimeString()
    };

    if (phase === 'login') loginApis.push(data);
    else if (phase === 'aqi') aqiApis.push(data);
  });

  /* =========================
     1️⃣ OPEN LOGIN PAGE
  ========================= */
  await page.goto('https://devenvizom.oizom.com/#/login');

  await page.getByPlaceholder(/email/i).fill(process.env.ENVIZOM_EMAIL);
  await page.getByPlaceholder(/password/i).fill(process.env.ENVIZOM_PASSWORD);

  await page.locator('mat-checkbox').click({ force: true });
  await page.getByRole('button', { name: /agree/i }).click();

  const loginBtn = page.locator('button:has-text("LOG IN")');

  await page.waitForFunction(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim() === 'LOG IN');
    return btn && !btn.disabled;
  });

  await loginBtn.click();

  /* =========================
     2️⃣ WAIT FOR MAP PAGE
  ========================= */
  await page.waitForURL(/overview\/map/, { timeout: 60000 });
  await page.waitForTimeout(8000);

  /* =========================
     3️⃣ CLOSE POPUPS / OVERLAYS
  ========================= */

  // Close any close icon popup
  const closeIcons = page.locator('mat-icon:has-text("close")');
  if (await closeIcons.count() > 0) {
    await closeIcons.first().click({ force: true });
    await page.waitForTimeout(2000);
  }

  // Remove dark overlay if present
  const backdrop = page.locator('.cdk-overlay-backdrop');
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.click({ force: true });
    await page.waitForTimeout(2000);
  }

  /* =========================
     SWITCH TO AQI CAPTURE MODE
  ========================= */
  phase = 'aqi';

  /* =========================
     4️⃣ CLICK AQI VIEW
  ========================= */
  await page.locator('mat-button-toggle:has-text("AQI View") button')
    .click({ force: true });

  await page.waitForURL(/overview\/aqi/, { timeout: 60000 });
  await page.waitForTimeout(6000);

  /* =========================
     5️⃣ SELECT DEVICE TYPE
  ========================= */
  const deviceType = page.locator('input[placeholder="Device Type"]');

  await deviceType.click({ force: true });
  await page.waitForTimeout(2000);

  const firstOption = page.locator('mat-option').first();
  await firstOption.click({ force: true });

  /* =========================
     6️⃣ SELECT TODAY DATE
  ========================= */
  await page.locator('input[formcontrolname="startDate"]').click({ force: true });
  await page.waitForTimeout(2000);

  // Click last date cell (today)
  await page.locator('.mat-calendar-body-cell-content').last().click();

  /* =========================
     7️⃣ SELECT TIME (PREVIOUS HOUR)
  ========================= */
  const timeInput = page.locator('input[formcontrolname="selectedTime"]');
  await timeInput.click({ force: true });

  await page.waitForTimeout(3000);

  const hour = new Date().getHours();
  let prevHour = hour - 1;
  if (prevHour <= 0) prevHour = 12;
  if (prevHour > 12) prevHour -= 12;

  await page.locator('.clock-face__number span', {
    hasText: prevHour.toString()
  }).click({ force: true });

  await page.locator('button:has-text("Ok")').click({ force: true });

  /* =========================
     8️⃣ CLICK APPLY
  ========================= */
  await page.getByRole('button', { name: /apply/i }).click({ force: true });

  await page.waitForTimeout(10000);

  /* =========================
     9️⃣ GENERATE HTML REPORT
  ========================= */

  const reportPath = path.join(__dirname, '../reports/api-report.html');

  const buildTable = (title, list) => `
    <h2>${title}</h2>
    <table border="1" cellspacing="0" cellpadding="6">
      <tr>
        <th>URL</th>
        <th>Method</th>
        <th>Status</th>
        <th>Time</th>
      </tr>
      ${list.map(api => `
        <tr style="background:${api.status === 200 ? '#d4edda' : '#f8d7da'}">
          <td>${api.url}</td>
          <td>${api.method}</td>
          <td>${api.status}</td>
          <td>${api.time}</td>
        </tr>
      `).join('')}
    </table>
  `;

  const html = `
    <html>
      <head>
        <title>Envizom API Monitor</title>
      </head>
      <body style="font-family: Arial">
        <h1>Envizom API Monitoring Report</h1>
        <p>Generated at: ${new Date().toLocaleString()}</p>

        ${buildTable('LOGIN APIs', loginApis)}
        <br/>
        ${buildTable('OVERVIEW AQI MODULE APIs', aqiApis)}

      </body>
    </html>
  `;

  fs.writeFileSync(reportPath, html);
  console.log('✅ API report generated:', reportPath);
});
