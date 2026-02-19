const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom API Monitor → Full Flow', async ({ page }) => {

  const loginApis = [];
  const aqiApis = [];
  const dashboardApis = [];

  let phase = 'login';

  /* =========================
     API CAPTURE
  ========================= */

  page.on('response', async (response) => {

    const url = response.url();
    if (!url.includes('envdevapi.oizom.com')) return;

    let responseData = '';

    try {
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('application/json')) {
        responseData = JSON.stringify(await response.json(), null, 2);
      } else {
        responseData = 'Non JSON response';
      }
    } catch {
      responseData = 'Failed to read response';
    }

    const api = {
      time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      method: response.request().method(),
      status: response.status(),
      url,
      data: responseData.substring(0, 1000)
    };

    if (phase === 'login') loginApis.push(api);
    else if (phase === 'aqi') aqiApis.push(api);
    else if (phase === 'dashboard') dashboardApis.push(api);
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
  await page.waitForTimeout(6000);

  /* =========================
     AQI MODULE
  ========================= */

  phase = 'aqi';

  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');
  await page.waitForTimeout(8000);

  const deviceType = page.locator(
    'input[formcontrolname="deviceType"]'
  );

  await deviceType.click();
  await page.waitForTimeout(1500);

  await page.locator('mat-option').first().click();

  await page.getByRole('button', { name: /apply/i }).click();

  await page.waitForTimeout(15000);

  /* =========================
     DASHBOARD MODULE
  ========================= */

  phase = 'dashboard';

  await page.goto(
    'https://devenvizom.oizom.com/#/dashboard/table/AQ0499001'
  );

  await page.waitForTimeout(8000);

  // DEVICE DROPDOWN
  const deviceInput =
    page.locator('input[formcontrolname="deviceSearch"]');

  await deviceInput.click();
  await page.waitForTimeout(1500);

  await page.locator('mat-option')
    .filter({ hasText: /polludrone/i })
    .first()
    .click();

  // DATE RANGE
  await page.locator('mat-datepicker-toggle button')
    .first()
    .click();

  await page.waitForTimeout(1500);

  const today = page.locator('.mat-calendar-body-today');

  await today.first().click();
  await page.waitForTimeout(800);
  await today.first().click();

  // DATA SPAN RANDOM
  const dataSpan =
    page.locator('mat-select[formcontrolname="dataSpan"]');

  await dataSpan.click();

  const options = [
    'Raw data',
    '15 min avg',
    '30 min avg',
    '1 hour avg'
  ];

  const random =
    options[Math.floor(Math.random() * options.length)];

  await page.locator('mat-option')
    .filter({ hasText: random })
    .first()
    .click();

  await page.getByRole('button', { name: /apply/i }).click();

  await page.waitForTimeout(15000);

  /* =========================
     HTML REPORT
  ========================= */

  const buildTableHtml = (data) => {

    let rows = '';

    data.forEach(api => {
      rows += `
      <tr class="${api.status === 200 ? 'ok' : 'fail'}">
        <td>${api.time}</td>
        <td>${api.status}</td>
        <td>${api.method}</td>
        <td class="url-cell">
          <a href="${api.url}" target="_blank">
            ${api.url.length > 80
              ? api.url.substring(0,80)+'...'
              : api.url}
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
    </table>`;
  };

  const html = `
<html>
<head>
<title>Envizom API Monitor</title>

<style>
body{font-family:Arial;padding:20px;background:#f5f7fb}
button{padding:10px 16px;margin-right:10px;
background:#2563eb;color:white;border:none;border-radius:6px}
.card{background:white;padding:15px;border-radius:10px;margin-top:20px}
.hidden{display:none}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ddd;padding:6px;font-size:12px}
th{background:#1f2937;color:white}
.ok{background:#e6f4ea}
.fail{background:#fdecea}
.url-cell{max-width:420px;word-break:break-all}
pre{max-height:180px;overflow:auto;background:#f8fafc}
</style>
</head>

<body>

<h1>Envizom API Health Monitor</h1>
<p><b>Run Time:</b> ${
  new Date().toLocaleString('en-IN',
  { timeZone:'Asia/Kolkata' })
}</p>

<button onclick="show('login')">🔐 LOGIN APIs</button>
<button onclick="show('aqi')">🌫 OVERVIEW → AQI APIs</button>
<button onclick="show('dashboard')">📊 DASHBOARD APIs</button>

<div id="login" class="card">
${buildTableHtml(loginApis)}
</div>

<div id="aqi" class="card hidden">
${buildTableHtml(aqiApis)}
</div>

<div id="dashboard" class="card hidden">
${buildTableHtml(dashboardApis)}
</div>

<script>
function show(id){
  ['login','aqi','dashboard']
  .forEach(x=>document.getElementById(x)
  .classList.add('hidden'));
  document.getElementById(id)
  .classList.remove('hidden');
}
</script>

</body>
</html>
`;

  fs.writeFileSync('docs/index.html', html);

  console.log('✔ Login APIs:', loginApis.length);
  console.log('✔ AQI APIs:', aqiApis.length);
  console.log('✔ Dashboard APIs:', dashboardApis.length);
  console.log('🚀 Report Updated');

});
