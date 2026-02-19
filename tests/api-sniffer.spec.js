const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom API Monitor → Full Flow', async ({ page }) => {

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

    if (phase === 'login') loginApis.push(api);
    if (phase === 'dashboard') dashboardApis.push(api);
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
  await page.getByRole('button', { name: /log in/i }).click();

  await page.waitForURL(/overview\/map/, { timeout: 90000 });
  await page.waitForTimeout(4000);

  /* =========================
     DASHBOARD MODULE
  ========================= */

  phase = 'dashboard';

  await page.goto(
    'https://devenvizom.oizom.com/#/dashboard/table/AQ0499001'
  );

  await page.waitForTimeout(6000);

  /* =========================
     REMOVE ALL OVERLAYS
  ========================= */

  await page.evaluate(() => {
    const kill = () => {
      document.querySelectorAll(
        '.transparent-overlay,.ngx-ui-tour_backdrop,.cdk-overlay-backdrop'
      ).forEach(el => el.remove());
    };

    kill();

    const observer = new MutationObserver(kill);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });

  /* =========================
     DEVICE DROPDOWN (RANDOM)
  ========================= */

  const deviceInput =
    page.locator('input[formcontrolname="deviceSearch"]');

  await deviceInput.click({ force: true });
  await page.waitForTimeout(1000);

  await page.waitForSelector('mat-option', { timeout: 60000 });

  const options = page.locator('mat-option');
  const count = await options.count();

  if (count === 0)
    throw new Error('No devices found');

  const randomIndex = Math.floor(Math.random() * count);

  await options.nth(randomIndex)
    .evaluate(el => el.click());

  await page.waitForTimeout(1500);

  /* =========================
     DATE RANGE (TODAY)
     SAFE VERSION (NO CALENDAR CLICK)
  ========================= */

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yy = String(today.getFullYear()).slice(-2);

  const dateStr = `${dd}/${mm}/${yy}`;

  const startDate =
    page.locator('input[formcontrolname="startDate"]');

  const endDate =
    page.locator('input[formcontrolname="endDate"]');

  await startDate.fill(dateStr);
  await endDate.fill(dateStr);

  await page.keyboard.press('Enter');

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
  ).click({ force: true });

  await page.locator('mat-option')
    .filter({ hasText: new RegExp(randomSpan, 'i') })
    .first()
    .evaluate(el => el.click());

  await page.waitForTimeout(1000);

  /* =========================
     IMPORTANT PART
     CAPTURE ONLY APPLY APIs
  ========================= */

  // remove auto-load APIs
  dashboardApis.length = 0;

  const applyApiWait = page.waitForResponse(resp =>
    resp.url().includes('/devices/data') &&
    resp.request().method() === 'GET' &&
    resp.status() === 200
  );

  /* =========================
     APPLY BUTTON
  ========================= */

  await page.getByRole('button', { name: /apply/i })
    .click({ force: true });

  await applyApiWait;

  await page.waitForTimeout(3000);

  /* =========================
     REPORT UI
  ========================= */

  const buildTable = (data) => {
    return `
      <table>
      <tr>
        <th>Time</th>
        <th>Status</th>
        <th>Method</th>
        <th>URL</th>
        <th>Response</th>
      </tr>
      ${data.map(api => `
        <tr class="${api.status===200?'ok':'fail'}">
          <td>${api.time}</td>
          <td>${api.status}</td>
          <td>${api.method}</td>
          <td class="url">${api.url}</td>
          <td><pre>${api.data}</pre></td>
        </tr>
      `).join('')}
      </table>
    `;
  };

  const html = `
<html>
<head>
<style>
body{font-family:Arial;padding:20px;background:#f5f7fb;}
button{padding:10px 18px;background:#2563eb;color:white;border:none;border-radius:6px;margin-right:10px;cursor:pointer;}
.card{background:white;padding:15px;margin-top:20px;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,0.1);}
.hidden{display:none;}
table{width:100%;border-collapse:collapse;}
th,td{border:1px solid #ddd;padding:6px;font-size:12px;vertical-align:top;}
th{background:#1f2937;color:white;}
.ok{background:#e6f4ea;}
.fail{background:#fdecea;}
.url{max-width:500px;word-break:break-all;font-family:monospace;}
pre{max-height:180px;overflow:auto;background:#f8fafc;padding:6px;}
</style>
</head>

<body>

<h1>Envizom API Monitor</h1>

<button onclick="showLogin()">🔐 LOGIN APIs</button>
<button onclick="showDash()">📊 DASHBOARD APPLY APIs</button>

<div id="login" class="card">
${buildTable(loginApis)}
</div>

<div id="dash" class="card hidden">
${buildTable(dashboardApis)}
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
</html>
`;

  fs.writeFileSync('docs/index.html', html);

  console.log('🔥 APPLY API captured successfully');
});
