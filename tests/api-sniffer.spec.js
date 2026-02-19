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
     REMOVE ALL OVERLAYS
  ========================= */

  await page.evaluate(() => {

    const kill = () => {
      document.querySelectorAll(
        '.transparent-overlay, \
         .ngx-ui-tour_backdrop, \
         .cdk-overlay-backdrop'
      ).forEach(el => el.remove());
    };

    kill();

    const observer = new MutationObserver(kill);
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

  await deviceInput.click({ force: true });
  await page.waitForTimeout(1000);

  await page.waitForSelector('mat-option', { timeout: 60000 });

  const options = page.locator('mat-option');
  const count = await options.count();

  if (count === 0) {
    throw new Error('No devices found');
  }

  const randomIndex = Math.floor(Math.random() * count);

  // JS click = bypass overlay problems
  await options.nth(randomIndex)
    .evaluate(el => el.click());

  await page.waitForTimeout(2000);

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
  ).click({ force: true });

  await page.locator('mat-option')
    .filter({ hasText: new RegExp(randomSpan, 'i') })
    .first()
    .evaluate(el => el.click());

  await page.waitForTimeout(1000);

  /* =========================
     APPLY BUTTON (SAFE)
  ========================= */

  dashboardApis.length = 0;

  await page.getByRole('button', { name: /apply/i })
    .click({ force: true });

  // wait for APIs naturally
  await page.waitForTimeout(8000);

  console.log(`🔥 Dashboard APIs: ${dashboardApis.length}`);

  /* =========================
     REPORT UI
  ========================= */

  const buildTable = (data) => {
    return `
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
        <td>${api.url}</td>
      </tr>
      `).join('')}
      </table>
    `;
  };

  const html = `
<html>
<body style="font-family:Arial;padding:20px">

<h1>Envizom API Monitor</h1>

<h2>🔐 Login APIs</h2>
${buildTable(loginApis)}

<h2>📊 Dashboard APIs</h2>
${buildTable(dashboardApis)}

</body>
</html>
`;

  fs.writeFileSync('docs/index.html', html);

  console.log('✅ Flow Completed');

});
