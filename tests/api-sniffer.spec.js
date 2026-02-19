const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('Envizom API Monitor → ULTRA STABLE FLOW', async ({ page }) => {

  const loginApis = [];
  const dashboardApis = [];

  let phase = 'login';

  /* =========================
     API CAPTURE
  ========================= */
  page.on('response', async (response) => {

    const url = response.url();
    if (!url.includes('envdevapi.oizom.com')) return;

    let data = '';
    try {
      if ((response.headers()['content-type'] || '')
        .includes('application/json')) {
        data = JSON.stringify(await response.json(), null, 2);
      }
    } catch {
      data = 'Unable to read response';
    }

    const api = {
      time: new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata'
      }),
      method: response.request().method(),
      status: response.status(),
      url,
      data: data.substring(0, 1000)
    };

    phase === 'login'
      ? loginApis.push(api)
      : dashboardApis.push(api);
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

  await Promise.all([
    page.waitForURL(/overview\/map/),
    page.getByRole('button', { name: /log in/i }).click()
  ]);

  /* =========================
     DASHBOARD PAGE
  ========================= */

  phase = 'dashboard';

  await page.goto(
    'https://devenvizom.oizom.com/#/dashboard/table/AQ0499001'
  );

  /* =========================
     AUTO REMOVE OVERLAYS
  ========================= */

  await page.evaluate(() => {
    const kill = () => {
      document.querySelectorAll(
        '.transparent-overlay,.ngx-ui-tour_backdrop,.cdk-overlay-backdrop'
      ).forEach(el => el.remove());
    };
    kill();
    new MutationObserver(kill).observe(document.body, {
      childList: true,
      subtree: true
    });
  });

  /* =========================
     DEVICE DROPDOWN
  ========================= */

  const deviceInput = page.locator(
    'input[formcontrolname="deviceSearch"]'
  );

  await deviceInput.click({ force: true });

  await page.waitForSelector('mat-option');

  const options = page.locator('mat-option');
  const count = await options.count();

  expect(count).toBeGreaterThan(0);

  const randomIndex = Math.floor(Math.random() * count);

  await options.nth(randomIndex).evaluate(el => el.click());

  /* =========================
     DATE RANGE (SAFE INPUT)
  ========================= */

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yy = String(today.getFullYear()).slice(-2);

  const dateString = `${dd}/${mm}/${yy}`;

  await page.locator(
    'input[formcontrolname="startDate"]'
  ).fill(dateString);

  await page.locator(
    'input[formcontrolname="endDate"]'
  ).fill(dateString);

  /* =========================
     DATA SPAN RANDOM
  ========================= */

  const spans = [
    'Raw Data',
    '15 min avg',
    '30 min avg',
    '1 hour avg'
  ];

  const randomSpan =
    spans[Math.floor(Math.random() * spans.length)];

  await page.locator(
    'mat-select[formcontrolname="dataSpan"]'
  ).click();

  await page.locator('mat-option')
    .filter({ hasText: new RegExp(randomSpan, 'i') })
    .first()
    .click({ force: true });

  /* =========================
     APPLY + WAIT FOR API
  ========================= */

  const apiPromise = page.waitForResponse(resp =>
    resp.url().includes('/devices/data') &&
    resp.status() === 200
  );

  await page.getByRole('button', { name: /apply/i })
    .click({ force: true });

  await apiPromise; // ⭐ REAL WAIT (NO TIMEOUT)

  /* =========================
     REPORT GENERATOR
  ========================= */

  const buildTableHtml = (data) => `
    <table>
      <tr>
        <th>Time</th>
        <th>Status</th>
        <th>Method</th>
        <th>URL</th>
        <th>Response</th>
      </tr>
      ${data.map(api => `
      <tr class="${api.status === 200 ? 'ok':'fail'}">
        <td>${api.time}</td>
        <td>${api.status}</td>
        <td>${api.method}</td>
        <td class="url-cell">${api.url}</td>
        <td><pre>${api.data}</pre></td>
      </tr>`).join('')}
    </table>
  `;

  const html = `
<html>
<head>
<style>
body{font-family:Arial;padding:20px;background:#f5f7fb;}
button{padding:10px 18px;background:#2563eb;color:white;border:none;border-radius:6px;}
.card{background:white;padding:15px;margin-top:20px;border-radius:10px;}
.hidden{display:none;}
table{width:100%;border-collapse:collapse;}
th,td{border:1px solid #ddd;padding:6px;font-size:12px;}
th{background:#1f2937;color:white;}
.ok{background:#e6f4ea;}
.fail{background:#fdecea;}
.url-cell{word-break:break-all;font-family:monospace;}
pre{max-height:180px;overflow:auto;background:#f8fafc;padding:6px;}
</style>
</head>

<body>

<h1>Envizom API Monitor</h1>

<button onclick="showLogin()">🔐 LOGIN APIs</button>
<button onclick="showDash()">📊 DASHBOARD APIs</button>

<div id="login" class="card">
${buildTableHtml(loginApis)}
</div>

<div id="dash" class="card hidden">
${buildTableHtml(dashboardApis)}
</div>

<script>
function showLogin(){
 document.getElementById('login').classList.remove('hidden');
 document.getElementById('dash').classList.add('hidden');
}
function showDash(){
 document.getElementById('dash').classList.remove('hidden');
 document.getElementById('login').classList.add('hidden');
}
</script>

</body>
</html>`;

  fs.writeFileSync('docs/index.html', html);

  console.log('🔥 ULTRA STABLE FLOW COMPLETED');
});
