const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('Envizom API Sniffer → HTML Report', async ({ page }) => {
    const capturedApis = [];

    /* ==============================
       1️⃣ CAPTURE BACKEND APIs
    ============================== */
    page.on('response', async (response) => {
        try {
            const url = response.url();
            if (url.includes('envdevapi.oizom.com')) {
                capturedApis.push({
                    time: new Date().toLocaleString(),
                    method: response.request().method(),
                    status: response.status(),
                    url
                });
            }
        } catch (err) {
            console.error('API capture error:', err);
        }
    });

    /* ==============================
       2️⃣ LOGIN FLOW
    ============================== */
    await page.goto('https://devenvizom.oizom.com/#/login', {
        waitUntil: 'load',
        timeout: 60000
    });

    await page.getByPlaceholder(/email/i)
  .fill(process.env.ENVIZOM_EMAIL);

    await page.getByPlaceholder(/password/i)
  .fill(process.env.ENVIZOM_PASSWORD);

    await page.locator('mat-checkbox').click({ force: true });
    await page.getByRole('button', { name: /agree/i }).click();

    const loginBtn = page.locator('button:has-text("LOG IN")');

    // Angular-safe enable check
    await page.waitForFunction(() => {
        const btn = [...document.querySelectorAll('button')]
            .find(b => b.innerText.trim() === 'LOG IN');
        return btn && !btn.disabled;
    }, { timeout: 30000 });

    await loginBtn.click();

    /* ==============================
       3️⃣ WAIT FOR ALL APIs
    ============================== */
    await page.waitForTimeout(15000);

    if (capturedApis.length === 0) {
        throw new Error('No APIs captured — possible login or backend issue');
    }

    /* ==============================
       4️⃣ GENERATE HTML REPORT
    ============================== */
    const reportDir = path.join(__dirname, '../docs');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);

    const reportPath = path.join(reportDir, 'api-report.html');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Envizom API Report</title>
  <style>
    body { font-family: Arial; background:#111; color:#eee; padding:20px }
    h1 { color:#00e5ff }
    table { width:100%; border-collapse: collapse; margin-top:20px }
    th, td { border:1px solid #333; padding:8px; font-size:13px }
    th { background:#222 }
    tr:nth-child(even) { background:#1b1b1b }
    .ok { color:#4caf50 }
    .fail { color:#ff5252 }
    .time { color:#aaa }
  </style>
</head>
<body>

<h1>Envizom API Monitor</h1>
<p>Run Time: <span class="time">${new Date().toLocaleString()}</span></p>
<p>Total APIs: <b>${capturedApis.length}</b></p>

<table>
  <tr>
    <th>#</th>
    <th>Time</th>
    <th>Method</th>
    <th>Status</th>
    <th>URL</th>
  </tr>
  ${capturedApis.map((api, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="time">${api.time}</td>
      <td>${api.method}</td>
      <td class="${api.status === 200 ? 'ok' : 'fail'}">${api.status}</td>
      <td>${api.url}</td>
    </tr>
  `).join('')}
</table>

</body>
</html>
`;

    fs.writeFileSync(reportPath, html);
    console.log(`✅ API report generated: ${reportPath}`);
});


