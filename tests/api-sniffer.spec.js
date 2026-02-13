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
   GENERATE REPORT UI
========================= */

const buildTableHtml = (data) => {
  let rows = "";

  data.forEach(api => {
    rows += `
      <tr class="${api.status === 200 ? 'ok' : 'fail'}">
        <td>${api.time}</td>
        <td>${api.status}</td>
        <td>${api.method}</td>
        <td class="url-cell">
  <a href="${api.url}" target="_blank">
    ${api.url.length > 80 ? api.url.substring(0, 80) + '...' : api.url}
  </a>
</td>

        <td><pre>${api.data}</pre></td>
      </tr>`;
  });

  return `
    <table>
      <tr>
        <th>Time</th>
        <th>Status</th>
        <th>Method</th>
        <th>URL</th>
        <th>Response</th>
      </tr>
      ${rows}
    </table>
  `;
};

const html = `
<html>
<head>
  <title>Envizom API Monitor</title>

 <style>
  body {
    font-family: Arial;
    padding: 20px;
    background: #f5f7fb;
  }

  h1 {
    margin-bottom: 5px;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 40px;
    background: white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  }

  th, td {
    border: 1px solid #ddd;
    padding: 6px;
    font-size: 12px;
    vertical-align: top;
  }

  th {
    background: #1f2937;
    color: white;
    font-weight: 600;
  }

  .ok {
    background: #e6f4ea;
  }

  .fail {
    background: #fdecea;
  }

  /* 🔴 FIX FOR UGLY URL COLUMN */
  .url-cell {
    max-width: 420px;
    word-break: break-all;
    font-family: monospace;
    font-size: 11px;
    color: #333;
  }

  .url-cell a {
    text-decoration: none;
    color: #2563eb;
  }

  .url-cell a:hover {
    text-decoration: underline;
  }

  pre {
    max-height: 180px;
    overflow: auto;
    background: #f8fafc;
    padding: 6px;
    border-radius: 4px;
  }
</style>
</head>

<body>

  <h1>📡 Envizom API Monitor</h1>
  <p><b>Last Run:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>

  <div class="buttons">
    <button onclick="showLogin()">🔐 LOGIN APIs</button>
    <button onclick="showAQI()">🌫 OVERVIEW → AQI APIs</button>
  </div>

  <div id="loginBox" class="card">
    <h2>🔐 Login APIs</h2>
    ${buildTableHtml(loginApis)}
  </div>

  <div id="aqiBox" class="card hidden">
    <h2>🌫 Overview AQI APIs</h2>
    ${buildTableHtml(aqiApis)}
  </div>

  <script>
    function showLogin() {
      document.getElementById('loginBox').classList.remove('hidden');
      document.getElementById('aqiBox').classList.add('hidden');
    }

    function showAQI() {
      document.getElementById('aqiBox').classList.remove('hidden');
      document.getElementById('loginBox').classList.add('hidden');
    }
  </script>

</body>
</html>
`;

fs.writeFileSync('docs/index.html', html);
console.log('✅ API report generated');
  });




