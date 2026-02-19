const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom API Monitor → Full Flow', async ({ page }) => {

  const loginApis = [];
  const dashboardApis = [];

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

    phase === 'login'
      ? loginApis.push(api)
      : dashboardApis.push(api);
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
  await page.waitForTimeout(5000);

  /* =========================
     DASHBOARD MODULE
  ========================= */

  phase = 'dashboard';

  await page.goto(
    'https://devenvizom.oizom.com/#/dashboard/table/AQ0499001'
  );

  await page.waitForTimeout(6000);

  /* =========================
     AUTO REMOVE TOUR OVERLAY
  ========================= */

  await page.evaluate(() => {

    const removeTour = () => {
      document.querySelectorAll('.ngx-ui-tour_backdrop')
        .forEach(el => el.remove());

      document.querySelectorAll('.cdk-overlay-backdrop')
        .forEach(el => el.remove());
    };

    removeTour();

    const observer = new MutationObserver(removeTour);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });

  await page.waitForTimeout(1500);

  /* =========================
     DEVICE DROPDOWN
  ========================= */

  const deviceInput = page.locator(
    'input[formcontrolname="deviceSearch"]'
  );

  await deviceInput.click();
  await deviceInput.fill('polludrone');

  await page.waitForTimeout(2000);

  await page.locator('mat-option')
    .filter({ hasText: /polludrone/i })
    .first()
    .click();

  await page.waitForTimeout(2000);

  /* =========================
     DATE RANGE (TODAY)
  ========================= */

  await page.locator(
    'mat-datepicker-toggle button'
  ).first().click();

  await page.waitForTimeout(1500);

  const today = new Date().getDate();

  const todayCell = page.locator('.mat-calendar-body-cell')
    .filter({ hasText: new RegExp(`^${today}$`) })
    .first();

  await todayCell.click();
  await page.waitForTimeout(400);
  await todayCell.click();

  await page.waitForTimeout(1000);

  /* =========================
     DATA SPAN DROPDOWN
  ========================= */

  const spans = [
    'Raw Data',
    '15 min avg',
    '30 min avg',
    '1 hour avg'
  ];

  const randomSpan =
    spans[Math.floor(Math.random() * spans.length)];

  await page.locator(
    'mat-select[formcontrolname="dataSpan"]'
  ).click();

  await page.locator('mat-option')
    .filter({ hasText: new RegExp(randomSpan, 'i') })
    .first()
    .click();

  await page.waitForTimeout(1000);

  /* =========================
     APPLY BUTTON
  ========================= */

  await page.getByRole('button', { name: /apply/i })
    .click();

  await page.waitForTimeout(15000);

  /* =========================
     REPORT UI
  ========================= */

  const buildTableHtml = (data) => {

    let rows = "";

    data.forEach(api => {
      rows += `
      <tr class="${api.status === 200 ? 'ok':'fail'}">
        <td>${api.time}</td>
        <td>${api.status}</td>
        <td>${api.method}</td>
        <td class="url-cell">
          <a href="${api.url}" target="_blank">
            ${api.url.length > 90 ? api.url.substring(0,90)+'...' : api.url}
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
<style>
body{font-family:Arial;padding:20px;background:#f5f7fb;}
button{padding:10px 18px;background:#2563eb;color:white;border:none;border-radius:6px;margin-right:10px;cursor:pointer;}
.card{background:white;padding:15px;margin-top:20px;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,0.1);}
.hidden{display:none;}
table{width:100%;border-collapse:collapse;}
th,td{border:1px solid #ddd;padding:6px;font-size:12px;vertical-align:top;}
th{background:#1f2937;color:white;}
.ok{background:#e6f4ea;}
.fail{background:#fdecea;}
.url-cell{max-width:420px;word-break:break-all;font-family:monospace;}
pre{max-height:180px;overflow:auto;background:#f8fafc;padding:6px;}
</style>
</head>

<body>

<h1>Envizom API Monitor</h1>

<button onclick="showLogin()">🔐 LOGIN APIs</button>
<button onclick="showDash()">📊 DASHBOARD APIs</button>

<div id="login" class="card">
${buildTableHtml(loginApis)}
</div>

<div id="dash" class="card hidden">
${buildTableHtml(dashboardApis)}
</div>

<script>
function showLogin(){
 document.getElementById('login').classList.remove('hidden');
 document.getElementById('dash').classList.add('hidden');
}
function showDash(){
 document.getElementById('dash').classList.remove('hidden');
 document.getElementById('login').classList.add('hidden');
}
</script>

</body>
</html>`;

  fs.writeFileSync('docs/index.html', html);

  console.log('✅ Dashboard Flow Completed');
});
