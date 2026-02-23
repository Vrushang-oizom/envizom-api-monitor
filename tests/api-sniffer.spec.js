const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { google } = require('googleapis');

/* =================================================
   GOOGLE SHEETS UPDATE
================================================= */

async function updateGoogleSheet(api) {

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
   console.log(process.env.GOOGLE_SERVICE_ACCOUNT?.slice(0,80));

  const sheets = google.sheets({
    version: 'v4',
    auth
  });

  const sheetId = process.env.GOOGLE_SHEET_ID;

  // Clear old rows (keep header)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: 'Sheet1!A2:E'
  });

  // Insert latest API
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Sheet1!A2',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        api.time,
        api.status,
        api.method,
        api.url,
        api.json
      ]]
    }
  });

  console.log('🔥 Google Sheet Updated');
}

/* =================================================
   MAIN TEST
================================================= */

test('Envizom API Monitor → ULTRA ENTERPRISE FLOW', async ({ page }) => {

  /* STORAGE */
  const loginApis = [];
  const overviewApis = [];
  const dashboardWidgetApis = [];
  const dashboardTableApis = [];

  let phase = 'login';

  /* HELPERS */

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

    else if (phase === 'overview') {
      if (
        api.method === 'GET' &&
        url.includes('/devices/data?')
      ) {
        overviewApis.length = 0;
        overviewApis.push(api);
      }
    }

    else if (phase === 'dashboard-widget') {
      dashboardWidgetApis.push(api);
    }

    else if (phase === 'dashboard-table') {
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
     DASHBOARD WIDGET
  ================================================= */

  await page.locator('a[title="Dashboard"]')
    .evaluate(el => el.click());

  await killOverlays();
  await wait(6000);

  phase = 'dashboard-widget';

  const deviceInput =
    page.locator('input[formcontrolname="deviceSearch"]');

  await deviceInput.click({ force:true });
  await deviceInput.fill('a');

  await page.waitForSelector('.mat-mdc-autocomplete-panel');

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
     DASHBOARD TABLE
  ================================================= */

  await page.goto(
    'https://devenvizom.oizom.com/#/dashboard/table/AQ0499001'
  );

  await killOverlays();
  await wait(6000);

  phase = 'dashboard-table';
  dashboardTableApis.length = 0;

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

  await page.getByRole('button',{ name:/apply/i })
    .click({ force:true });

  await wait(8000);

  console.log('🔥 TABLE API CAPTURED:',
    dashboardTableApis.length);

  /* =================================================
     HTML REPORT
  ================================================= */

  const table = (data, section) => `
<table>
<tr>
<th>Time</th><th>Status</th><th>Method</th><th>URL</th><th>Response</th>
</tr>
${data.map((a,i)=>`
<tr>
<td>${a.time}</td>
<td>${a.status}</td>
<td>${a.method}</td>
<td>${a.url}</td>
<td><pre>${a.json}</pre></td>
</tr>
`).join('')}
</table>`;

  fs.writeFileSync('docs/index.html', `
<html><body>
<h1>Envizom API Monitor</h1>
${table(loginApis,'login')}
${table(overviewApis,'overview')}
${table(dashboardWidgetApis,'widget')}
${table(dashboardTableApis,'table')}
</body></html>
`);

  /* =================================================
     GOOGLE SHEET UPDATE
  ================================================= */

  const latestApi =
    dashboardTableApis[0] ||
    overviewApis[0] ||
    dashboardWidgetApis[0] ||
    loginApis[0];

  if (latestApi) {
    await updateGoogleSheet(latestApi);
  }

  console.log('🔥 FLOW COMPLETE');
});

