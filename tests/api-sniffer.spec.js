const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom API Monitor → Full Flow', async ({ page }) => {

  const loginApis = [];
  const overviewApis = [];
  const dashboardWidgetApis = [];
  const dashboardTableApis = [];

  let phase = 'login';

  /* =========================
     CAPTURE APIs
  ========================= */

  page.on('response', async (response) => {

    const url = response.url();
    if (!url.startsWith('https://envdevapi.oizom.com/')) return;

    let json = '';
    try {
      if ((response.headers()['content-type'] || '').includes('application/json')) {
        const data = await response.json();
        json = JSON.stringify(data, null, 2).substring(0, 1500);
      }
    } catch {
      json = 'Unable to read JSON';
    }

    const api = {
      time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      method: response.request().method(),
      status: response.status(),
      url,
      json
    };

    if (phase === 'login') loginApis.push(api);
    else if (phase === 'overview') overviewApis.push(api);
    else if (phase === 'widget') dashboardWidgetApis.push(api);
    else if (phase === 'table') dashboardTableApis.push(api);
  });

  /* =========================
     LOGIN
  ========================= */

  await page.goto('https://devenvizom.oizom.com/#/login');

  await page.getByPlaceholder(/email/i).fill(process.env.ENVIZOM_EMAIL);
  await page.getByPlaceholder(/password/i).fill(process.env.ENVIZOM_PASSWORD);

  await page.getByRole('button', { name: /log in/i }).click();

  await page.waitForURL(/overview\/map/, { timeout: 90000 });
  await page.waitForTimeout(5000);

  /* =========================
     OVERVIEW AQI
  ========================= */

  phase = 'overview';

  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');
  await page.waitForTimeout(6000);

  /* =========================
     DASHBOARD WIDGET VIEW
  ========================= */

  phase = 'widget';

  await page.locator('a[title="Dashboard"]').click();
  await page.waitForTimeout(4000);

  // default dashboard = widget view
  await page.waitForTimeout(6000);

  /* =========================
     SELECT RANDOM DEVICE
  ========================= */

  await page.locator('input[formcontrolname="deviceSearch"]').click();

  await page.waitForSelector('.cdk-overlay-pane mat-option');

  const devices = page.locator('.cdk-overlay-pane mat-option');
  const count = await devices.count();

  const randomIndex = Math.floor(Math.random() * count);
  await devices.nth(randomIndex).click();

  await page.waitForTimeout(5000);

  /* =========================
     DASHBOARD TABLE VIEW
  ========================= */

  phase = 'table';

  await page.goto('https://devenvizom.oizom.com/#/dashboard/table');
  await page.waitForTimeout(7000);

  console.log('Login:', loginApis.length);
  console.log('Overview:', overviewApis.length);
  console.log('Widget:', dashboardWidgetApis.length);
  console.log('Table:', dashboardTableApis.length);

  /* =========================
     BUILD GUI
  ========================= */

  const buildTable = (data) => `
  <table>
    <tr>
      <th>Time</th>
      <th>Status</th>
      <th>Method</th>
      <th>URL</th>
    </tr>
    ${data.map(api => `
      <tr>
        <td>${api.time}</td>
        <td>${api.status}</td>
        <td>${api.method}</td>
        <td style="max-width:600px;word-break:break-all">${api.url}</td>
      </tr>
      <tr>
        <td colspan="4">
          <details>
            <summary>View JSON</summary>
            <pre>${api.json}</pre>
          </details>
        </td>
      </tr>
    `).join('')}
  </table>
  `;

  const html = `
<html>
<head>
<style>
body { font-family: Arial; padding: 20px; background:#111; color:#eee }
button { padding:10px 15px; margin:5px; cursor:pointer }
.hidden { display:none }
table { border-collapse: collapse; width:100%; margin-top:20px }
th, td { border:1px solid #444; padding:8px }
th { background:#222 }
pre { background:#000; padding:10px; overflow:auto }
</style>
<script>
function show(id){
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
</script>
</head>
<body>

<h1>Envizom API Monitor</h1>

<button onclick="show('login')">Login APIs</button>
<button onclick="show('overview')">Overview AQI APIs</button>
<button onclick="show('widget')">Dashboard Widget View APIs</button>
<button onclick="show('table')">Dashboard Table View APIs</button>

<div id="login" class="section">${buildTable(loginApis)}</div>
<div id="overview" class="section hidden">${buildTable(overviewApis)}</div>
<div id="widget" class="section hidden">${buildTable(dashboardWidgetApis)}</div>
<div id="table" class="section hidden">${buildTable(dashboardTableApis)}</div>

</body>
</html>
`;

  fs.writeFileSync('docs/index.html', html);

});
