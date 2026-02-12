const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom Full Flow → Login → AQI → Capture APIs', async ({ page }) => {

  const loginApis = [];
  const aqiApis = [];

  let phase = "login"; // login → aqi

  /* =========================
     CAPTURE ALL API CALLS
  ========================= */
  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('envdevapi.oizom.com')) {
      const apiData = {
        time: new Date().toLocaleTimeString('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
}),

        method: response.request().method(),
        status: response.status(),
        url
      };

      if (phase === "login") {
        loginApis.push(apiData);
      } else {
        aqiApis.push(apiData);
      }
    }
  });

  /* =========================
     LOGIN
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
     WAIT FOR OVERVIEW MAP
  ========================= */
  await page.waitForURL(/overview\/map/, { timeout: 90000 });
  await page.waitForTimeout(8000);

  /* =========================
     OPEN AQI VIEW DIRECTLY
  ========================= */
  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');
  await page.waitForTimeout(8000);

  /* =========================
     SELECT DEVICE TYPE
  ========================= */
  const deviceType = page.locator('input[formcontrolname="deviceType"]');
  await deviceType.waitFor({ timeout: 60000 });

  await deviceType.click();
  await page.waitForTimeout(2000);

  await page.locator('mat-option').first().click();

  /* =========================
     SKIP DATE & TIME
     (Use default values already filled)
  ========================= */

  /* =========================
     CLICK APPLY
  ========================= */
  await page.getByRole('button', { name: /apply/i }).click();

  // 🔴 SWITCH PHASE AFTER APPLY
  phase = "aqi";

  // Let AQI APIs fire
  await page.waitForTimeout(15000);

  /* =========================
     GENERATE HTML REPORT
  ========================= */

  const buildTable = (title, data) => {
    let html = `<h2>${title}</h2>
    <table>
      <tr>
        <th>Time</th>
        <th>Status</th>
        <th>Method</th>
        <th>URL</th>
      </tr>`;

    data.forEach(api => {
      html += `
        <tr class="${api.status === 200 ? 'ok' : 'fail'}">
          <td>${api.time}</td>
          <td>${api.status}</td>
          <td>${api.method}</td>
          <td>${api.url}</td>
        </tr>`;
    });

    html += `</table><br/>`;
    return html;
  };

  const html = `
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

    <h1>Envizom API Health Report</h1>
    <p><b>Last Run:</b> ${new Date().toLocaleString()}</p>

    ${buildTable("🔐 Login + Overview APIs", loginApis)}

    ${buildTable("🌫 Overview AQI Module APIs", aqiApis)}

  </body>
  </html>
  `;

  fs.writeFileSync('docs/index.html', html);

  console.log("Login APIs:", loginApis.length);
  console.log("AQI APIs:", aqiApis.length);
  console.log("✅ HTML report updated");
});

