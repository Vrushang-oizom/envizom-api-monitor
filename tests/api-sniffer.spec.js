const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('Envizom API Monitor → ULTRA ENTERPRISE FLOW', async ({ page }) => {

  /* =================================================
     STORAGE
  ================================================= */

  const loginApis = [];
  const overviewApis = [];
  const dashboardWidgetApis = [];
  const dashboardTableApis = [];

  let phase = 'login';

  /* =================================================
     ENTERPRISE HELPERS
  ================================================= */

  async function killOverlays() {
    await page.evaluate(() => {

      const kill = () => {
        document.querySelectorAll(
          '.cdk-overlay-backdrop,\
           .ngx-ui-tour_backdrop,\
           .transparent-overlay'
        ).forEach(e => e.remove());
      };

      kill();

      new MutationObserver(kill).observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  const wait = (ms) => page.waitForTimeout(ms);

  /* =================================================
     API CAPTURE ENGINE
  ================================================= */

  page.on('response', async (response) => {

    const url = response.url();
    if (!url.startsWith('https://envdevapi.oizom.com/')) return;

    let json = '';
    try {
      if ((response.headers()['content-type'] || '')
        .includes('application/json')) {
        json = JSON.stringify(await response.json(), null, 2);
      }
    } catch {}

    const api = {
      time: new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata'
      }),
      method: response.request().method(),
      status: response.status(),
      url,
      json: json.substring(0, 1500)
    };

    if (phase === 'login') loginApis.push(api);
    else if (phase === 'overview') overviewApis.push(api);
    else if (phase === 'dashboard-widget') dashboardWidgetApis.push(api);
    else if (phase === 'dashboard-table') {

      // ONLY ONE TABLE API
      if (
        api.method === 'GET' &&
        url.includes('/devices/data?')
      ) {
        dashboardTableApis.length = 0;
        dashboardTableApis.push(api);
      }
    }
  });

  /* =================================================
     LOGIN FLOW
  ================================================= */

  await page.goto('https://devenvizom.oizom.com/#/login');

  await page.getByPlaceholder(/email/i)
    .fill(process.env.ENVIZOM_EMAIL);

  await page.getByPlaceholder(/password/i)
    .fill(process.env.ENVIZOM_PASSWORD);

  const checkbox = page.locator('mat-checkbox');
  if (await checkbox.count())
    await checkbox.first().click({ force:true });

  const agreeBtn = page.getByRole('button', { name:/agree/i });
  if (await agreeBtn.count())
    await agreeBtn.click({ force:true });

  const loginBtn =
    page.getByRole('button', { name:/log in/i });

  await expect(loginBtn).toBeEnabled({ timeout:20000 });

  await loginBtn.click();

  await page.waitForURL(/overview\/map/, {
    timeout: 90000
  });

  await killOverlays();
  await wait(5000);

  /* =================================================
     OVERVIEW AQI
  ================================================= */

  phase = 'overview';

  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');

  await killOverlays();
  await wait(7000);

  /* =================================================
     DASHBOARD WIDGET VIEW
  ================================================= */

  await page.locator('a[title="Dashboard"]')
    .evaluate(el => el.click());

  await killOverlays();
  await wait(6000);

  phase = 'dashboard-widget';

  /* ===== DEVICE DROPDOWN ===== */

  const deviceInput =
    page.locator('input[formcontrolname="deviceSearch"]');

  await deviceInput.click({ force:true });

  // trigger autocomplete
  await deviceInput.fill('a');

  await page.waitForSelector(
    '.mat-mdc-autocomplete-panel',
    { timeout:60000 }
  );

  const options =
    page.locator('.mat-mdc-autocomplete-panel mat-option');

  const optionCount = await options.count();

  if (optionCount === 0)
    throw new Error('No devices loaded');

  const randomIndex =
    Math.floor(Math.random() * optionCount);

  await options.nth(randomIndex)
    .evaluate(el => el.click());

  await wait(5000);

  /* =================================================
     DASHBOARD TABLE VIEW
  ================================================= */

  await page.goto(
    'https://devenvizom.oizom.com/#/dashboard/table/AQ0499001'
  );

  await killOverlays();
  await wait(6000);

  phase = 'dashboard-table';
  dashboardTableApis.length = 0;

  /* ===== DATA SPAN ===== */

  const spanSelect =
    page.locator('mat-select[formcontrolname="dataSpan"]');

  await spanSelect.click({ force:true });

  const spans = [
    'Raw data',
    '15 minute avg',
    '30 minute avg',
    '1 hour avg'
  ];

  const randomSpan =
    spans[Math.floor(Math.random()*spans.length)];

  await page.locator('.cdk-overlay-pane mat-option')
    .filter({ hasText:new RegExp(randomSpan,'i') })
    .first()
    .evaluate(el => el.click());

  await wait(1000);

  /* ===== APPLY ===== */

  await page.getByRole('button',{ name:/apply/i })
    .click({ force:true });

  await wait(8000);

  console.log('🔥 TABLE API CAPTURED:',
    dashboardTableApis.length);

  /* =================================================
     REPORT UI
  ================================================= */

  const table = data => `
  <table>
    <tr>
      <th>Time</th>
      <th>Status</th>
      <th>Method</th>
      <th>URL</th>
      <th>JSON</th>
    </tr>
    ${data.map(a=>`
      <tr>
        <td>${a.time}</td>
        <td>${a.status}</td>
        <td>${a.method}</td>
        <td class="url">${a.url}</td>
        <td><pre>${a.json}</pre></td>
      </tr>
    `).join('')}
  </table>`;

  const html = `
<html>
<head>
<style>
body{font-family:Arial;background:#0f172a;color:white;padding:20px}
button{padding:10px 15px;margin:5px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer}
.card{display:none;background:#111827;padding:15px;margin-top:20px;border-radius:10px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #374151;padding:6px;font-size:12px}
.url{max-width:420px;word-break:break-all}
pre{max-height:200px;overflow:auto;background:#000;padding:8px}
</style>
</head>
<body>

<h1>🚀 Envizom API Monitor — ULTRA ENTERPRISE</h1>

<button onclick="show('login')">Login APIs</button>
<button onclick="show('overview')">Overview AQI APIs</button>
<button onclick="show('widget')">Dashboard Widget APIs</button>
<button onclick="show('table')">Dashboard Table View APIs</button>

<div id="login" class="card">${table(loginApis)}</div>
<div id="overview" class="card">${table(overviewApis)}</div>
<div id="widget" class="card">${table(dashboardWidgetApis)}</div>
<div id="table" class="card">${table(dashboardTableApis)}</div>

<script>
function show(id){
 document.querySelectorAll('.card')
  .forEach(c=>c.style.display='none');
 document.getElementById(id).style.display='block';
}
show('login');
</script>

</body>
</html>
`;

  fs.writeFileSync('docs/index.html', html);

  console.log('🔥 ULTRA ENTERPRISE FLOW COMPLETE');
});
