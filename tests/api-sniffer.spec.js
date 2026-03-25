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
  await page.screenshot({ path: 'docs/cluster-step0-page-loaded.png', fullPage: true });

  // STEP 1 — Click "Add Cluster" button
  const addClusterBtn = page.getByRole('button', { name: /add cluster/i });
  await addClusterBtn.click({ force: true });
  await wait(2000);
  await page.screenshot({ path: 'docs/cluster-step1-add-cluster-clicked.png', fullPage: true });

  // STEP 2 — Select "Polludrone" from Device Type dropdown
  const deviceTypeSelect = page.locator('mat-select[formcontrolname="deviceType"]');
  await deviceTypeSelect.click({ force: true });
  await page.waitForSelector('.mat-mdc-select-panel[aria-multiselectable="false"]', { timeout: 10000 });
  await wait(1000);
  await page.screenshot({ path: 'docs/cluster-step2-device-type-open.png', fullPage: true });

  const polludroneOption = page.locator('.mat-mdc-select-panel mat-option .mdc-list-item__primary-text').filter({ hasText: /POLLUDRONE/i });
  await polludroneOption.first().click();
  await wait(1000);

  // STEP 3 — Enter random cluster name
  const randomNum = Math.floor(Math.random() * 100000);
  const clusterNameInput = page.locator('input[formcontrolname="clusterName"]');
  await clusterNameInput.click({ force: true });
  await clusterNameInput.fill(`test${randomNum}`);
  await wait(1000);
  await page.screenshot({ path: 'docs/cluster-step3-form-filled.png', fullPage: true });

  // STEP 4 — Click Next
  const nextBtn1 = page.locator('button[ng-reflect-message="Next"], button:has-text("Next")').first();
  await nextBtn1.evaluate(el => el.click());
  await wait(5000);
  await page.screenshot({ path: 'docs/cluster-step4-after-next1.png', fullPage: true });

  // Verify stepper moved
  await page.waitForSelector('mat-select[formcontrolname="selectedDevicesControl"]', { state: 'attached', timeout: 10000 });

  // STEP 5 — Select 2-3 devices from multi-select dropdown (NOT "Select All")
  const selectDevices = page.locator('mat-select[formcontrolname="selectedDevicesControl"]');
  await selectDevices.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
  await wait(2000);
  await selectDevices.dispatchEvent('click');
  await wait(1000);

  const panelVisible = await page.locator('.mat-mdc-select-panel[aria-multiselectable="true"]').isVisible().catch(() => false);
  if (!panelVisible) {
    console.log('⚠️ Panel not open, trying parent click...');
    await selectDevices.evaluate(el => el.click());
    await wait(2000);
  }

  await page.waitForSelector('.mat-mdc-select-panel[aria-multiselectable="true"]', { timeout: 10000 });
  await wait(2000);
  await page.screenshot({ path: 'docs/cluster-step5-devices-dropdown-open.png', fullPage: true });

  const deviceOptions = page.locator('.mat-mdc-select-panel[aria-multiselectable="true"] mat-option.mat-mdc-option-multiple');
  const deviceCount = await deviceOptions.count();

  if (deviceCount === 0) {
    console.log('⚠️ No devices on first try, retrying dropdown...');
    // Close dropdown by clicking the dialog heading (safe area)
    await page.locator('text=Add Cluster').first().click({ force: true }).catch(() => {});
    await wait(2000);
    await selectDevices.click({ force: true });
    await page.waitForSelector('.mat-mdc-select-panel[aria-multiselectable="true"]', { timeout: 10000 });
    await wait(3000);
  }

  const finalDeviceCount = await deviceOptions.count();
  if (finalDeviceCount === 0)
    throw new Error('No devices found in cluster device list after retry');

  const devicesToSelect = Math.min(3, finalDeviceCount);
  for (let i = 0; i < devicesToSelect; i++) {
    await deviceOptions.nth(i).click();
    await wait(500);
  }

  await page.screenshot({ path: 'docs/cluster-step5-devices-selected.png', fullPage: true });

  // STEP 6a — First Next click → closes dropdown, shows selected devices summary
  await page.locator('button:has-text("Next")').first().click({ force: true });
  await wait(3000);
  await page.screenshot({ path: 'docs/cluster-step6a-dropdown-closed.png', fullPage: true });

  // STEP 6b — Second Next click → goes to polygon/map step
  await page.locator('button:has-text("Next")').first().click({ force: true });
  await wait(5000);
  await page.screenshot({ path: 'docs/cluster-step6b-map-loaded.png', fullPage: true });

  // STEP 7 — Draw polygon on the map covering the devices
  const mapContainer = page.locator('.gm-style').first();
  const mapVisible = await mapContainer.isVisible({ timeout: 10000 }).catch(() => false);
  await page.screenshot({ path: 'docs/cluster-step7-before-polygon.png', fullPage: true });

  if (mapVisible) {
    const mapBox = await mapContainer.boundingBox();

    if (mapBox) {
      const cx = mapBox.x + mapBox.width / 2;
      const cy = mapBox.y + mapBox.height / 2;
      const rx = mapBox.width * 0.25;
      const ry = mapBox.height * 0.20;

      const points = [
        { x: cx - rx, y: cy - ry },
        { x: cx + rx, y: cy - ry },
        { x: cx + rx, y: cy + ry },
        { x: cx - rx, y: cy + ry },
      ];

      for (const pt of points) {
        await page.mouse.click(pt.x, pt.y);
        await wait(700);
      }

      await page.mouse.dblclick(points[0].x, points[0].y);
      await wait(2000);
    } else {
      console.log('⚠️ Map container has no bounding box');
    }
  } else {
    console.log('⚠️ Map container not visible');
  }

  await page.screenshot({ path: 'docs/cluster-step7-after-polygon.png', fullPage: true });

  // STEP 8 — Click Submit
  const submitBtn = page.locator('button[ng-reflect-message="Submit"], button:has-text("Submit")').first();
  const submitVisible = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`📡 Submit button visible: ${submitVisible}`);
  await page.screenshot({ path: 'docs/cluster-step8-before-submit.png', fullPage: true });

  if (submitVisible) {
    await submitBtn.evaluate(el => el.click());
  } else {
    console.log('⚠️ Submit button not found — skipping cluster submission');
  }

  // Wait for the 2 cluster APIs: /cluster and /overview/v2
  await Promise.allSettled([
    page.waitForResponse(
      r => r.url().includes('/cluster'),
      { timeout: 15000 }
    ),
    page.waitForResponse(
      r => r.url().includes('/overview/v2'),
      { timeout: 15000 }
    ),
  ]).then(results => {
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) {
      console.log(`⚠️ ${failed.length} cluster API(s) did not fire within timeout`);
    }
  });

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
