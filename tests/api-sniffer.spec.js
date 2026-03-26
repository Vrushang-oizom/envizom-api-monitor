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
  const clusterApis = [];

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
    else if (phase === 'cluster') {
      if (url.includes('/cluster') || url.includes('/overview/v2')) {
        clusterApis.push(api);
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

  await wait(3000);

  console.log(`🔥 LOGIN APIs CAPTURED: ${loginApis.length}`);
  loginApis.forEach(a => console.log(`   → [${a.status}] ${a.method} ${a.url.substring(0, 100)}`));

  /* ================= OVERVIEW ================= */

  phase = 'overview';
  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');

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

  /* ================= CLUSTER ================= */

  phase = 'cluster';
  await page.goto('https://devenvizom.oizom.com/#/cluster/map');
  await killOverlays();
  await wait(5000);

  // 1. Click "Add Cluster"
  await page.getByRole('button', { name: /add cluster/i }).click({ force: true });
  await wait(3000);

  // 2. Select "POLLUDRONE" from Device Type
  await page.locator('mat-select[formcontrolname="deviceType"]').click({ force: true });
  await wait(2000);
  await page.locator('mat-option:has-text("POLLUDRONE")').click();
  await wait(1000);

  // 3. Type cluster name
  await page.locator('input[formcontrolname="clusterName"]').fill(`test${Math.floor(Math.random() * 100000)}`);
  await wait(1000);

  // 4. Click Next → go to step 2 (Select Devices)
  await page.locator('button:has-text("Next")').click({ force: true });
  await wait(5000);
  await page.screenshot({ path: 'docs/cluster-step2-devices.png', fullPage: true });

  // 5. Open device dropdown
  await page.locator('mat-select[formcontrolname="selectedDevicesControl"]').click({ force: true });
  await wait(3000);
  await page.screenshot({ path: 'docs/cluster-step2-dropdown-open.png', fullPage: true });

  // 6. Select first 3 devices (skip "Select All")
  const clusterDeviceOptions = page.locator('mat-option.mat-mdc-option-multiple');
  const clusterDeviceCount = await clusterDeviceOptions.count();
  console.log(`📡 Cluster devices found: ${clusterDeviceCount}`);

  for (let i = 0; i < Math.min(3, clusterDeviceCount); i++) {
    await clusterDeviceOptions.nth(i).click();
    await wait(500);
  }
  await page.screenshot({ path: 'docs/cluster-step2-devices-checked.png', fullPage: true });

  // 7. First Next click → closes dropdown, shows selected devices summary
  await page.locator('button:has-text("Next")').click({ force: true });
  await wait(3000);
  await page.screenshot({ path: 'docs/cluster-step2-summary.png', fullPage: true });

  // 8. Second Next click → go to step 3 (Map / Polygon)
  await page.locator('button:has-text("Next")').click({ force: true });
  await wait(5000);
  await page.screenshot({ path: 'docs/cluster-step3-map.png', fullPage: true });

  // 9. Draw polygon on map
  const mapEl = page.locator('.gm-style').first();
  const mapBox = await mapEl.boundingBox();

  if (mapBox) {
    const cx = mapBox.x + mapBox.width / 2;
    const cy = mapBox.y + mapBox.height / 2;
    const rx = mapBox.width * 0.25;
    const ry = mapBox.height * 0.20;

    // 4 corners
    await page.mouse.click(cx - rx, cy - ry); await wait(700);
    await page.mouse.click(cx + rx, cy - ry); await wait(700);
    await page.mouse.click(cx + rx, cy + ry); await wait(700);
    await page.mouse.click(cx - rx, cy + ry); await wait(700);

    // Close polygon
    await page.mouse.dblclick(cx - rx, cy - ry);
    await wait(2000);
  }
  await page.screenshot({ path: 'docs/cluster-step3-polygon-drawn.png', fullPage: true });

  // 10. Click Submit
  await page.locator('button:has-text("Submit")').click({ force: true });

  // Wait for the 2 cluster APIs
  await Promise.allSettled([
    page.waitForResponse(r => r.url().includes('/cluster'), { timeout: 15000 }),
    page.waitForResponse(r => r.url().includes('/overview/v2'), { timeout: 15000 }),
  ]);

  await wait(3000);

  console.log(`🔥 CLUSTER APIs CAPTURED: ${clusterApis.length}`);
  clusterApis.forEach(a => console.log(`   → [${a.status}] ${a.method} ${a.url.substring(0, 100)}`));

  /* ================= HTML REPORT ================= */

  const allSections = [
    { id: 'login',      label: 'Login',             data: loginApis },
    { id: 'overview',   label: 'Overview',           data: overviewApis },
    { id: 'widget',     label: 'Dashboard Widget',   data: dashboardWidgetApis },
    { id: 'table',      label: 'Dashboard Table',    data: dashboardTableApis },
    { id: 'cluster',    label: 'Cluster',            data: clusterApis },
  ];

  const totalApis = allSections.reduce((sum, s) => sum + s.data.length, 0);

  const tableHtml = (data, section) => `
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
.summary{background:#1e293b;padding:12px;border-radius:8px;margin-bottom:15px;display:flex;flex-wrap:wrap;gap:10px}
.summary span{font-size:14px}
.tabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:5px}
.tab-btn{background:#1e293b;color:white;border:1px solid #374151;padding:8px 16px;cursor:pointer;border-radius:6px;font-size:13px}
.tab-btn.active{background:#16a34a;border-color:#16a34a}
</style>
</head>
<body>

<h1>Envizom API Monitor</h1>

<div class="summary">
${allSections.map(s => `  <span>${s.label}: ${s.data.length} APIs</span>`).join('\n')}
  <span><strong>Total: ${totalApis} APIs</strong></span>
</div>

<div class="tabs">
${allSections.map((s, i) => `  <button class="tab-btn${i === 0 ? ' active' : ''}" onclick="show('${s.id}',this)">${s.label} (${s.data.length})</button>`).join('\n')}
</div>

${allSections.map(s => `<div id="${s.id}" class="card">${tableHtml(s.data, s.id)}</div>`).join('\n')}

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
  await updateGoogleSheet('Cluster', clusterApis);

  console.log('✅ FLOW COMPLETE');
});
