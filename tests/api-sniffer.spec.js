const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom API Monitor → Login + AQI APIs', async ({ page }) => {

  const loginApis = [];
  const aqiApis = [];

  let phase = 'login';

  const IMPORTANT_API_PATTERNS = [
    '/users/login',
    '/overview',
    '/devices/data',
    '/real-time'
  ];

  /* =========================
     CAPTURE IMPORTANT APIs
  ========================= */
  page.on('response', async (response) => {
    const url = response.url();

    if (!url.includes('envdevapi.oizom.com')) return;
    if (!IMPORTANT_API_PATTERNS.some(p => url.includes(p))) return;

    let responseData = '';
    try {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('application/json')) {
        responseData = JSON.stringify(await response.json(), null, 2);
      } else {
        responseData = 'Non-JSON response';
      }
    } catch {
      responseData = 'Failed to read response';
    }

    const api = {
      time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      method: response.request().method(),
      status: response.status(),
      url,
      data: responseData.substring(0, 1000) // limit size
    };

    phase === 'login' ? loginApis.push(api) : aqiApis.push(api);
  });

  /* =========================
     LOGIN
  ========================= */
  await page.goto('https://devenvizom.oizom.com/#/login');

  await page.getByPlaceholder(/email/i).fill(process.env.ENVIZOM_EMAIL);
  await page.getByPlaceholder(/password/i).fill(process.env.ENVIZOM_PASSWORD);

  await page.locator('mat-checkbox').click({ force: true });
  await page.getByRole('button', { name: /agree/i }).click();

  await page.getByRole('button', { name: /log in/i }).click();

  await page.waitForURL(/overview\/map/, { timeout: 90000 });
  await page.waitForTimeout(5000);

  /* =========================
     SWITCH TO AQI PHASE
  ========================= */
  phase = 'aqi';

  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');
  await page.waitForTimeout(8000);

  /* =========================
     DEVICE TYPE (ONLY)
  ========================= */
  const deviceType = page.locator('input[formcontrolname="deviceType"]');
  await deviceType.waitFor({ timeout: 60000 });
  await deviceType.click();
  await page.locator('mat-option').first().click();

  /* =========================
     APPLY (NO TIME SELECTION)
  ========================= */
  await page.getByRole('button', { name: /apply/i }).click();

  // Wait for AQI APIs
  await page.waitForTimeout(15000);

  /* =========================
     GENERATE REPORT
  ========================= */
  const buildTable = (title, data) => `
    <h2>${title}</h2>
    <table>
      <tr>
        <th>Time</th>
        <th>Status</th>
        <th>Method</th>
        <th>URL</th>
        <th>Response (trimmed)</th>
      </tr>
      ${data.map(api => `
        <tr class="${api.status === 200 ? 'ok' : 'fail'}">
          <td>${api.time}</td>
          <td>${api.status}</td>
          <td>${api.method}</td>
          <td>${api.url}</td>
          <td><pre>${api.data}</pre></td>
        </tr>
      `).join('')}
    </table>
  `;

  const html = `
  <html>
  <head>
    <title>Envizom API Monitor</title>
    <style>
      body { font-family: Arial; padding: 20px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 40px; }
      th, td { border: 1px solid #ddd; padding: 6px; font-size: 12px; }
      th { background: #222; color: white; }
      .ok { background: #d4edda; }
      .fail { background: #f8d7da; }
      pre { max-height: 200px; overflow: auto; }
    </style>
  </head>
  <body>
    <h1>Envizom API Health Monitor</h1>
    <p><b>Run Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>

    ${buildTable('🔐 LOGIN APIs', loginApis)}
    ${buildTable('🌫 OVERVIEW → AQI APIs', aqiApis)}

  </body>
  </html>
  `;

  fs.writeFileSync('docs/index.html', html);
  console.log('✅ API report generated');
});
