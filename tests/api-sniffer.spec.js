const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { google } = require('googleapis');

/* =================================================
   GOOGLE SHEETS UPDATE
================================================= */

async function updateGoogleSheet(sheetName, apis) {

  if (!apis.length) return;

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({
    version: 'v4',
    auth
  });

  const sheetId = process.env.GOOGLE_SHEET_ID;

  // STEP 1 — Insert empty rows at TOP
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [{
        insertDimension: {
          range: {
            sheetId: await getSheetId(sheets, sheetId, sheetName),
            dimension: "ROWS",
            startIndex: 1,
            endIndex: 1 + apis.length
          },
          inheritFromBefore: false
        }
      }]
    }
  });

  // STEP 2 — Write new APIs on top
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${sheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: {
      values: apis.map(api => [
        api.time,
        api.status,
        api.method,
        api.url,
        api.json
      ])
    }
  });

  console.log(`🔥 Updated Sheet: ${sheetName}`);
}

async function getSheetId(sheets, spreadsheetId, name) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId
  });

  const sheet = meta.data.sheets.find(
    s => s.properties.title === name
  );

  return sheet.properties.sheetId;
}

/* =================================================
   MAIN TEST
================================================= */

test('Envizom API Monitor → ULTRA ENTERPRISE FLOW', async ({ page }) => {

  const loginApis = [];
  const overviewApis = [];
  const dashboardWidgetApis = [];
  const dashboardTableApis = [];

  let phase = 'login';

  const wait = (ms) => page.waitForTimeout(ms);

  async function killOverlays() {
    await page.evaluate(() => {
      const kill = () => {
        document.querySelectorAll(
          '.cdk-overlay-backdrop,.ngx-ui-tour_backdrop,.transparent-overlay'
        ).forEach(e => e.remove());
      };
      kill();
      new MutationObserver(kill).observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  /* ================= API CAPTURE ================= */

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
      time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      method: response.request().method(),
      status: response.status(),
      url,
      json: json.substring(0, 1500)
    };

    // Login & Widget → capture ALL APIs
    // Overview & Table → capture ONLY the last /devices/data? call
    if (phase === 'login') {
      loginApis.push(api);
    }
    else if (phase === 'overview') {
      if (api.method === 'GET' && url.includes('/devices/data?')) {
        overviewApis.length = 0;
        overviewApis.push(api);
      }
    }
    else if (phase === 'dashboard-widget') {
      dashboardWidgetApis.push(api);
    }
    else if (phase === 'dashboard-table') {
      if (api.method === 'GET' && url.includes('/devices/data?')) {
        dashboardTableApis.length = 0;
        dashboardTableApis.push(api);
      }
    }
  });

  /* ================= LOGIN ================= */

  await page.goto('https://devenvizom.oizom.com/#/login');

  await page.getByPlaceholder(/email/i)
    .fill(process.env.ENVIZOM_EMAIL);

  await page.getByPlaceholder(/password/i)
    .fill(process.env.ENVIZOM_PASSWORD);

  // checkbox (if exists)
  const checkbox = page.locator('mat-checkbox');
  if (await checkbox.count()) {
    await checkbox.first().click({ force: true });
  }

  // agree button (if exists)
  const agreeBtn = page.getByRole('button', { name: /agree/i });
  if (await agreeBtn.count()) {
    await agreeBtn.click({ force: true });
  }

  const loginBtn = page.getByRole('button', { name: /log in/i });

  await expect(loginBtn).toBeEnabled({ timeout: 20000 });

  await loginBtn.click();

  await Promise.race([
    page.waitForURL(/overview\/map/, { timeout: 90000 }),
    page.locator('body').waitFor({ state: 'visible', timeout: 90000 })
  ]);

  await killOverlays();

  // Wait for ALL 5 critical login-phase APIs before switching phase
  // Track overview/v2 calls — there are 2 (without token, then with lastUpdatedToken)
  let overviewV2Count = 0;
  const overviewV2Done = new Promise((resolve) => {
    const handler = (response) => {
      if (response.url().includes('/overview/v2')) {
        overviewV2Count++;
        if (overviewV2Count >= 2) {
          page.off('response', handler);
          resolve();
        }
      }
    };
    page.on('response', handler);
    setTimeout(() => { page.off('response', handler); resolve(); }, 20000);
  });

  await Promise.allSettled([
    page.waitForResponse(
      r => r.url().includes('/users/login/v2'),
      { timeout: 15000 }
    ),
    overviewV2Done,
    page.waitForResponse(
      r => r.url().includes('/devices/data?'),
      { timeout: 15000 }
    ),
    page.waitForResponse(
      r => r.url().includes('/real-time/users/'),
      { timeout: 15000 }
    ),
  ]).then(results => {
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) {
      console.log(`⚠️ ${failed.length} login API(s) did not fire within timeout`);
    }
    console.log(`📡 overview/v2 calls detected: ${overviewV2Count}/2`);
  });

  // Extra buffer for any trailing responses
  await wait(3000);

  console.log(`🔥 LOGIN APIs CAPTURED: ${loginApis.length}`);
  loginApis.forEach(a => console.log(`   → [${a.status}] ${a.method} ${a.url.substring(0, 100)}`));

  /* ================= OVERVIEW ================= */

  phase = 'overview';
  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');

  // Wait for the /devices/data? API (the only one we capture for overview)
  await Promise.allSettled([
    page.waitForResponse(
      r => r.url().includes('/devices/data?'),
      { timeout: 15000 }
    ),
  ]).then(results => {
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) {
      console.log(`⚠️ Overview /devices/data? API did not fire within timeout`);
    }
  });

  await wait(3000);

  console.log(`🔥 OVERVIEW APIs CAPTURED: ${overviewApis.length}`);
  overviewApis.forEach(a => console.log(`   → [${a.status}] ${a.method} ${a.url.substring(0, 100)}`));

  /* ================= DASHBOARD ================= */

  await page.locator('a[title="Dashboard"]').evaluate(el => el.click());
  await wait(6000);

  phase = 'dashboard-widget';

  const deviceInput = page.locator('input[formcontrolname="deviceSearch"]');
  await deviceInput.click({ force: true });
  await deviceInput.fill('a');

  await page.waitForSelector('.mat-mdc-autocomplete-panel');

  const options = page.locator('.mat-mdc-autocomplete-panel mat-option');
  const count = await options.count();

  if (count === 0)
    throw new Error('No devices loaded');

  await options.nth(Math.floor(Math.random() * count)).click();

  // Wait for widget APIs to resolve
  await Promise.allSettled([
    page.waitForResponse(
      r => r.url().includes('/devices/data?'),
      { timeout: 15000 }
    ),
  ]).then(results => {
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) {
      console.log(`⚠️ ${failed.length} widget API(s) did not fire within timeout`);
    }
  });

  await wait(3000);

  console.log(`🔥 DASHBOARD WIDGET APIs CAPTURED: ${dashboardWidgetApis.length}`);
  dashboardWidgetApis.forEach(a => console.log(`   → [${a.status}] ${a.method} ${a.url.substring(0, 100)}`));

  /* ================= TABLE ================= */

  await page.goto('https://devenvizom.oizom.com/#/dashboard/table/AQ0499001');

  phase = 'dashboard-table';

  // Wait for table APIs to resolve
  await Promise.allSettled([
    page.waitForResponse(
      r => r.url().includes('/devices/data?'),
      { timeout: 15000 }
    ),
  ]).then(results => {
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) {
      console.log(`⚠️ ${failed.length} table API(s) did not fire within timeout`);
    }
  });

  await wait(3000);

  console.log(`🔥 TABLE APIs CAPTURED: ${dashboardTableApis.length}`);
  dashboardTableApis.forEach(a => console.log(`   → [${a.status}] ${a.method} ${a.url.substring(0, 100)}`));

  /* ================= HTML REPORT ================= */

  const table = (data, section) => `
<table>
<tr><th>Time</th><th>Status</th><th>Method</th><th>URL</th><th>Response</th></tr>
${data.map((a, i) => `
<tr>
<td>${a.time}</td>
<td>${a.status}</td>
<td>${a.method}</td>
<td class="url">${a.url}</td>
<td>
<button class="json-btn" onclick="toggleJson('j-${section}-${i}')">View JSON</button>
<pre id="j-${section}-${i}" class="json-box">${a.json}</pre>
</td>
</tr>`).join('')}
</table>`;

  const html = `
<html>
<head>
<style>
body{font-family:Arial;background:#0f172a;color:white;padding:20px}
.card{display:none;background:#111827;padding:15px;margin-top:20px;border-radius:10px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #374151;padding:6px;font-size:12px}
.url{max-width:420px;word-break:break-all}
.json-btn{background:#16a34a;color:white;border:none;padding:5px 10px;cursor:pointer;border-radius:4px}
.json-box{display:none;background:black;color:#22c55e;max-height:220px;overflow:auto;padding:8px;font-size:11px}
.summary{background:#1e293b;padding:12px;border-radius:8px;margin-bottom:15px}
.summary span{margin-right:20px;font-size:14px}
.tab-btn{background:#1e293b;color:white;border:1px solid #374151;padding:8px 16px;cursor:pointer;border-radius:6px;margin-right:5px;font-size:13px}
.tab-btn.active{background:#16a34a;border-color:#16a34a}
</style>
</head>
<body>

<h1>Envizom API Monitor</h1>

<div class="summary">
  <span>Login: ${loginApis.length} APIs</span>
  <span>Overview: ${overviewApis.length} APIs</span>
  <span>Widget: ${dashboardWidgetApis.length} APIs</span>
  <span>Table: ${dashboardTableApis.length} APIs</span>
  <span>Total: ${loginApis.length + overviewApis.length + dashboardWidgetApis.length + dashboardTableApis.length} APIs</span>
</div>

<button class="tab-btn active" onclick="show('login',this)">Login (${loginApis.length})</button>
<button class="tab-btn" onclick="show('overview',this)">Overview (${overviewApis.length})</button>
<button class="tab-btn" onclick="show('widget',this)">Dashboard Widget (${dashboardWidgetApis.length})</button>
<button class="tab-btn" onclick="show('table',this)">Dashboard Table (${dashboardTableApis.length})</button>

<div id="login" class="card">${table(loginApis, 'login')}</div>
<div id="overview" class="card">${table(overviewApis, 'overview')}</div>
<div id="widget" class="card">${table(dashboardWidgetApis, 'widget')}</div>
<div id="table" class="card">${table(dashboardTableApis, 'table')}</div>

<script>
function show(id, btn){
 document.querySelectorAll('.card').forEach(c=>c.style.display='none');
 document.getElementById(id).style.display='block';
 document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
 if(btn) btn.classList.add('active');
}
function toggleJson(id){
 const el=document.getElementById(id);
 el.style.display=el.style.display==='block'?'none':'block';
}
show('login', document.querySelector('.tab-btn'));
</script>

</body>
</html>
`;

  fs.writeFileSync('docs/index.html', html);

  /* ================= GOOGLE SHEET ================= */

  await updateGoogleSheet('Login', loginApis);
  await updateGoogleSheet('Overview AQI', overviewApis);
  await updateGoogleSheet('Dashboard Widget', dashboardWidgetApis);
  await updateGoogleSheet('Dashboard Table', dashboardTableApis);

  console.log('✅ FLOW COMPLETE');
});
