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
      new MutationObserver(kill).observe(document.body,{
        childList:true,
        subtree:true
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
      time: new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),
      method: response.request().method(),
      status: response.status(),
      url,
      json: json.substring(0,1500)
    };

    if (phase === 'login') loginApis.push(api);

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
    await checkbox.first().click({ force:true });
  }

  // agree button (if exists)
  const agreeBtn = page.getByRole('button', { name:/agree/i });
  if (await agreeBtn.count()) {
    await agreeBtn.click({ force:true });
  }

  const loginBtn = page.getByRole('button',{name:/log in/i});

  await expect(loginBtn).toBeEnabled({ timeout:20000 });

  await loginBtn.click();

  await page.waitForURL(/overview\/map/, { timeout:90000 });

  await killOverlays();
  await wait(5000);

  /* ================= OVERVIEW ================= */

  phase = 'overview';
  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');
  await wait(7000);

  /* ================= DASHBOARD ================= */

  await page.locator('a[title="Dashboard"]').evaluate(el=>el.click());
  await wait(6000);

  phase = 'dashboard-widget';

  const deviceInput = page.locator('input[formcontrolname="deviceSearch"]');
  await deviceInput.click({force:true});
  await deviceInput.fill('a');

  await page.waitForSelector('.mat-mdc-autocomplete-panel');

  const options = page.locator('.mat-mdc-autocomplete-panel mat-option');
  const count = await options.count();

  if (count === 0)
    throw new Error('No devices loaded');

  await options.nth(Math.floor(Math.random()*count)).click();

  await wait(5000);

  /* ================= TABLE ================= */

  await page.goto('https://devenvizom.oizom.com/#/dashboard/table/AQ0499001');

  phase = 'dashboard-table';
  await wait(8000);

  console.log('🔥 TABLE API CAPTURED:', dashboardTableApis.length);

  /* ================= HTML REPORT ================= */

  const table = (data, section) => `
<table>
<tr><th>Time</th><th>Status</th><th>Method</th><th>URL</th><th>Response</th></tr>
${data.map((a,i)=>`
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
.json-btn{background:#16a34a;color:white;border:none;padding:5px 10px}
.json-box{display:none;background:black;color:#22c55e;max-height:220px;overflow:auto}
</style>
</head>
<body>

<h1>Envizom API Monitor</h1>

<button onclick="show('login')">Login</button>
<button onclick="show('overview')">Overview</button>
<button onclick="show('widget')">Dashboard Widget</button>
<button onclick="show('table')">Dashboard Table</button>

<div id="login" class="card">${table(loginApis,'login')}</div>
<div id="overview" class="card">${table(overviewApis,'overview')}</div>
<div id="widget" class="card">${table(dashboardWidgetApis,'widget')}</div>
<div id="table" class="card">${table(dashboardTableApis,'table')}</div>

<script>
function show(id){
 document.querySelectorAll('.card').forEach(c=>c.style.display='none');
 document.getElementById(id).style.display='block';
}
function toggleJson(id){
 const el=document.getElementById(id);
 el.style.display=el.style.display==='block'?'none':'block';
}
show('login');
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
  console.log('FLOW COMPLETE');
});



