const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom Full Flow → Login → AQI → Capture APIs', async ({ page }) => {
  const apis = [];

  /* =========================
     CAPTURE ALL API CALLS
  ========================= */
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('envdevapi.oizom.com')) {
      apis.push({
        time: new Date().toLocaleString(),
        method: response.request().method(),
        status: response.status(),
        url
      });
    }
  });

  /* =========================
     1️⃣ LOGIN
  ========================= */
  await page.goto('https://devenvizom.oizom.com/#/login');

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

  await page.getByRole('button', { name: /log in/i }).click();

  /* =========================
     2️⃣ WAIT FOR OVERVIEW MAP
  ========================= */
  await page.waitForURL(/overview\/map/, { timeout: 90000 });
  await page.waitForTimeout(6000);

  /* =========================
     3️⃣ OPEN AQI VIEW
  ========================= */
  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');
  await page.waitForTimeout(8000);

  /* =========================
     4️⃣ SELECT DEVICE TYPE
  ========================= */
  const deviceType = page.locator('input[formcontrolname="deviceType"]');
  await deviceType.waitFor({ timeout: 60000 });

  await deviceType.click();
  await page.waitForTimeout(2000);

  await page.locator('mat-option').first().click();

  /* =========================
     5️⃣ ENTER TODAY DATE (DD/MM/YY)
  ========================= */
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yy = String(today.getFullYear()).slice(-2);

  const dateStr = `${dd}/${mm}/${yy}`;

  const dateInput = page.locator('input[formcontrolname="startDate"]');
  await dateInput.fill(dateStr);
  await page.keyboard.press('Enter');

  /* =========================
     6️⃣ OPEN TIME PICKER
  ========================= */
  const timeInput = page.locator('input[formcontrolname="selectedTime"]');
  await timeInput.click();

  await page.waitForSelector('.clock-face', { timeout: 30000 });

  /* =========================
     7️⃣ SELECT PREVIOUS HOUR
  ========================= */
  const currentHour = new Date().getHours();
  let prevHour = currentHour === 0 ? 12 : currentHour - 1;

  if (prevHour > 12) prevHour -= 12;
  if (prevHour === 0) prevHour = 12;

  const hourText = String(prevHour);

  await page.locator('.clock-face__number span')
    .filter({ hasText: hourText })
    .first()
    .click();

  await page.waitForTimeout(1500);

  /* =========================
     8️⃣ CLICK OK IN CLOCK
  ========================= */
  await page.locator('button.timepicker-button:has-text("Ok")').click();

  /* =========================
     9️⃣ CLICK APPLY
  ========================= */
  await page.getByRole('button', { name: /apply/i }).click();

  /* =========================
     🔟 WAIT FOR AQI APIs
  ========================= */
  await page.waitForTimeout(15000);

  /* =========================
     1️⃣1️⃣ GENERATE HTML REPORT
  ========================= */
  let html = `
  <html>
  <head>
    <title>Envizom API Monitor</title>
    <style>
      body { font-family: Arial; padding: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 8px; font-size: 13px; }
      th { background: #333; color: #fff; }
      .ok { background: #d4edda; }
      .fail { background: #f8d7da; }
    </style>
  </head>
  <body>
    <h2>Envizom API Monitor</h2>
    <p><b>Last Run:</b> ${new Date().toLocaleString()}</p>
    <table>
      <tr>
        <th>Time</th>
        <th>Status</th>
        <th>Method</th>
        <th>URL</th>
      </tr>
  `;

  apis.forEach(api => {
    html += `
      <tr class="${api.status === 200 ? 'ok' : 'fail'}">
        <td>${api.time}</td>
        <td>${api.status}</td>
        <td>${api.method}</td>
        <td>${api.url}</td>
      </tr>
    `;
  });

  html += `
    </table>
  </body>
  </html>
  `;

  fs.writeFileSync('docs/index.html', html);

  console.log(`✅ API report generated with ${apis.length} APIs`);
});
