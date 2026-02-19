const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom API Monitor → Full Flow', async ({ page }) => {

  const loginApis = [];
  const dashboardApis = [];
  const aqiApis = [];

  let phase = 'login';

  /* =========================
     CAPTURE APIs
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
    else if (phase === 'dashboard') dashboardApis.push(api);
    else if (phase === 'aqi') aqiApis.push(api);
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

  /* =========================
     REMOVE OVERLAYS
  ========================= */
  await page.evaluate(() => {
    const kill = () => {
      document.querySelectorAll(
        '.transparent-overlay, .ngx-ui-tour_backdrop, .cdk-overlay-backdrop'
      ).forEach(el => el.remove());
    };
    kill();
    new MutationObserver(kill).observe(document.body,{
      childList:true,
      subtree:true
    });
  });

  /* =========================
     DASHBOARD FLOW
  ========================= */

  phase = 'dashboard';

  await page.goto(
    'https://devenvizom.oizom.com/#/dashboard/table/AQ0499001'
  );

  await page.waitForTimeout(5000);

  // device dropdown
  const deviceInput =
    page.locator('input[formcontrolname="deviceSearch"]');

  await deviceInput.click({ force:true });
  await page.waitForSelector('mat-option');

  const devices = page.locator('mat-option');
  const count = await devices.count();

  await devices
    .nth(Math.floor(Math.random()*count))
    .evaluate(el => el.click());

  await page.waitForTimeout(1000);

  // data span dropdown
  const spans = [
    'Raw data',
    '15 minute avg',
    '30 minute avg',
    '1 hour avg'
  ];

  const randomSpan =
    spans[Math.floor(Math.random()*spans.length)];

  await page.locator(
    'mat-select[formcontrolname="dataSpan"]'
  ).evaluate(el => el.click());

  await page.waitForSelector('#mat-select-0-panel');

  await page.locator('mat-option')
    .filter({ hasText:new RegExp(randomSpan,'i') })
    .first()
    .evaluate(el => el.click());

  await page.waitForTimeout(1000);

  // APPLY
  dashboardApis.length = 0;

  await page.getByRole('button',{ name:/apply/i })
    .click({ force:true });

  await page.waitForTimeout(8000);

  /* =========================
     OVERVIEW AQI FLOW
  ========================= */

  phase = 'aqi';

  await page.goto(
    'https://devenvizom.oizom.com/#/overview/aqi'
  );

  await page.waitForTimeout(8000);

  // select device type (first option)
  const deviceType =
    page.locator('input[formcontrolname="deviceType"]');

  if (await deviceType.count()) {
    await deviceType.first().click({ force:true });
    await page.waitForTimeout(1000);

    const opts = page.locator('mat-option');
    if (await opts.count())
      await opts.first().evaluate(el=>el.click());
  }

  await page.waitForTimeout(2000);

  /* =========================
     REPORT UI
  ========================= */

  const buildTable = (data) => `
  <table>
    <tr>
      <th>Time</th>
      <th>Status</th>
      <th>Method</th>
      <th>URL</th>
    </tr>
    ${data.map(a=>`
    <tr class="${a.status===200?'ok':'fail'}">
      <td>${a.time}</td>
      <td>${a.status}</td>
      <td>${a.method}</td>
      <td class="url">${a.url}</td>
    </tr>
    `).join('')}
  </table>
  `;

  const html = `
<html>
<head>
<style>
body{font-family:Arial;background:#f5f7fb;padding:20px;}
h1{margin-bottom:10px;}
button{
padding:10px 18px;
margin-right:10px;
border:none;
background:#2563eb;
color:white;
border-radius:6px;
cursor:pointer;
font-weight:bold;
}
button:hover{background:#1d4ed8;}
.card{
background:white;
padding:15px;
margin-top:20px;
border-radius:10px;
box-shadow:0 2px 6px rgba(0,0,0,0.1);
}
.hidden{display:none;}
table{width:100%;border-collapse:collapse;}
th,td{border:1px solid #ddd;padding:6px;font-size:12px;}
th{background:#1f2937;color:white;}
.ok{background:#e6f4ea;}
.fail{background:#fdecea;}
.url{word-break:break-all;font-family:monospace;}
</style>
</head>

<body>

<h1>Envizom API Monitor</h1>

<button onclick="show('login')">🔐 LOGIN APIs</button>
<button onclick="show('dash')">📊 DASHBOARD APIs</button>
<button onclick="show('aqi')">🌫 OVERVIEW AQI APIs</button>

<div id="login" class="card">
${buildTable(loginApis)}
</div>

<div id="dash" class="card hidden">
${buildTable(dashboardApis)}
</div>

<div id="aqi" class="card hidden">
${buildTable(aqiApis)}
</div>

<script>
function show(id){
 ['login','dash','aqi'].forEach(x=>{
   document.getElementById(x).classList.add('hidden');
 });
 document.getElementById(id).classList.remove('hidden');
}
</script>

</body>
</html>
`;

  fs.writeFileSync('docs/index.html', html);

  console.log('🔥 FULL FLOW COMPLETED');
});
