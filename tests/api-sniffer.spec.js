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
  const clusterDataViewApis = [];


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

  if (phase === 'login') {
    loginApis.push(api);
  }
  else if (phase === 'overview') {
    overviewApis.push(api);
  }
  else if (phase === 'dashboard-widget') {
    dashboardWidgetApis.push(api);
  }
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
  else if (phase === 'cluster-data') {
    clusterDataViewApis.push(api);
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
   CLUSTER → DATA VIEW
================================================= */

phase = 'cluster-data';

await page.goto('https://devenvizom.oizom.com/#/cluster');
await killOverlays();
await wait(6000);

/* ===== CLICK DATA VIEW BUTTON ===== */

await page
  .locator('button:has-text("Data View")')
  .first()
  .click({ force:true });

await wait(3000);

/* ===== CLUSTER DROPDOWN (ENTERPRISE FINAL) ===== */

const clusterInput =
  page.locator('input[formcontrolname="clusterName"]');

/* wait until input is really ready */
await expect(clusterInput).toBeVisible({ timeout: 60000 });
await expect(clusterInput).toBeEnabled({ timeout: 60000 });

/* click input */
await clusterInput.click({ force:true });

/* IMPORTANT: use keyboard instead of fill */
await page.keyboard.type('a');

await wait(2000);

/* wait until options actually exist */
await page.waitForFunction(() => {
  return document.querySelectorAll(
    '.mat-mdc-autocomplete-panel mat-option'
  ).length > 0;
}, { timeout: 60000 });

const clusterOptions =
  page.locator('.mat-mdc-autocomplete-panel mat-option');

const clusterCount =
  await clusterOptions.count();

if (clusterCount === 0)
  throw new Error('No cluster options found');

const randomCluster =
  Math.floor(Math.random() * clusterCount);

await clusterOptions
  .nth(randomCluster)
  .evaluate(el => el.click());

await wait(2000);

/* ===== APPLY BUTTON ===== */

await page.getByRole('button', { name:/apply/i })
  .click({ force:true });

await wait(8000);

console.log('🔥 CLUSTER APIs:', clusterDataViewApis.length);


  /* =================================================
     REPORT UI
  ================================================= */
const table = (data, section) => `
<table>
  <tr>
    <th>Time</th>
    <th>Status</th>
    <th>Method</th>
    <th>URL</th>
    <th>Response</th>
  </tr>

  ${data.map((a,i)=>`
    <tr>
      <td>${a.time}</td>
      <td>${a.status}</td>
      <td>${a.method}</td>
      <td class="url">${a.url}</td>

      <td>
        <button class="json-btn"
          onclick="toggleJson('json-${section}-${i}')">
          View JSON
        </button>

        <pre id="json-${section}-${i}" class="json-box">
${a.json}
        </pre>
      </td>
    </tr>
  `).join('')}
</table>`;



  const html = `
<html>
<head>
<style>
body{
  font-family:Arial;
  background:#0f172a;
  color:white;
  padding:20px;
}

button{
  padding:10px 15px;
  margin:5px;
  background:#2563eb;
  color:white;
  border:none;
  border-radius:6px;
  cursor:pointer;
}

.card{
  display:none;
  background:#111827;
  padding:15px;
  margin-top:20px;
  border-radius:10px;
}

table{
  width:100%;
  border-collapse:collapse;
}

th,td{
  border:1px solid #374151;
  padding:6px;
  font-size:12px;
  vertical-align:top;
}

.url{
  max-width:420px;
  word-break:break-all;
}

.json-btn{
  background:#16a34a;
  font-size:11px;
  padding:5px 10px;
}

.json-btn:hover{
  background:#15803d;
}

.json-box{
  display:none;
  max-height:220px;
  overflow:auto;
  background:#000;
  padding:8px;
  margin-top:6px;
  border-radius:6px;
}
</style>

</head>
<body>

<h1>Envizom API Monitor</h1>

<button onclick="show('login')">Login APIs</button>
<button onclick="show('overview')">Overview AQI APIs</button>
<button onclick="show('widget')">Dashboard Widget APIs</button>
<button onclick="show('table')">Dashboard Table View APIs</button>
<button onclick="show('cluster')">Cluster Data View APIs</button>


<div id="login" class="card">${table(loginApis,'login')}</div>
<div id="overview" class="card">${table(overviewApis,'overview')}</div>
<div id="widget" class="card">${table(dashboardWidgetApis,'widget')}</div>
<div id="table" class="card">${table(dashboardTableApis,'table')}</div>
<div id="cluster" class="card">
  ${table(clusterDataViewApis,'cluster')}
</div>

<script>
function show(id){
 document.querySelectorAll('.card')
  .forEach(c=>c.style.display='none');
 document.getElementById(id).style.display='block';
}

function toggleJson(id){
 const el = document.getElementById(id);
 el.style.display =
   el.style.display === 'block' ? 'none' : 'block';
}

show('login');
</script>


</body>
</html>
`;

  fs.writeFileSync('docs/index.html', html);

  console.log('🔥 ULTRA ENTERPRISE FLOW COMPLETE');
});














