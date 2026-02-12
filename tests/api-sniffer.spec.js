const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('Envizom Full Flow → Login → AQI → Capture APIs', async ({ page }) => {

  if (!process.env.ENVIZOM_EMAIL || !process.env.ENVIZOM_PASSWORD) {
    throw new Error('Missing ENVIZOM credentials');
  }

  const capturedApis = [];
  const seen = new Set();

  // Capture ALL API responses
  page.on('response', response => {
    const url = response.url();
    if (url.includes('envdevapi.oizom.com')) {
      const key = `${response.request().method()} ${url}`;
      if (!seen.has(key)) {
        seen.add(key);
        capturedApis.push({
          time: new Date().toISOString(),
          method: response.request().method(),
          url,
          status: response.status()
        });
      }
    }
  });

  /* =========================
     1️⃣ LOGIN
  ========================= */

  await page.goto('https://devenvizom.oizom.com/#/login');

  await page.getByPlaceholder(/email/i).fill(process.env.ENVIZOM_EMAIL);
  await page.getByPlaceholder(/password/i).fill(process.env.ENVIZOM_PASSWORD);

  await page.locator('mat-checkbox').click({ force: true });
  await page.getByRole('button', { name: /agree/i }).click();

  await page.waitForFunction(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim() === 'LOG IN');
    return btn && !btn.disabled;
  });

  await page.locator('button:has-text("LOG IN")').click();

  // wait dashboard load
  await page.waitForTimeout(15000);

  /* =========================
     2️⃣ CLICK AQI VIEW
  ========================= */

  await page.getByRole('button', { name: /aqi view/i }).click();
  await page.waitForTimeout(3000);

  /* =========================
     3️⃣ SELECT DEVICE TYPE
  ========================= */

  const deviceTypeInput = page.locator('input[placeholder="Device Type"]');
  await deviceTypeInput.click();

  const firstDeviceType = page.locator('mat-option').first();
  await firstDeviceType.click();

  await page.waitForTimeout(2000);

  /* =========================
     4️⃣ SELECT TODAY DATE
  ========================= */

  const dateInput = page.locator('input[formcontrolname="startDate"]');
  await dateInput.click();

  await page.waitForTimeout(1000);

  // Click today date automatically
  await page.locator('.mat-calendar-body-today').click().catch(() => {});

  await page.waitForTimeout(2000);

  /* =========================
     5️⃣ OPEN TIME PICKER
  ========================= */

  const timeInput = page.locator('input[formcontrolname="selectedTime"]');
  await timeInput.click();

  await page.waitForTimeout(2000);

  /* =========================
     6️⃣ SELECT PREVIOUS HOUR
  ========================= */

  const currentHour = new Date().getHours();
  let targetHour = currentHour - 1;
  if (targetHour === 0) targetHour = 12;
  if (targetHour > 12) targetHour -= 12;

  await page.locator(`.clock-face__number span:text("${targetHour}")`).click();

  await page.waitForTimeout(1000);

  // Click OK
  await page.getByText(/^ok$/i).click();

  await page.waitForTimeout(2000);

  /* =========================
     7️⃣ CLICK APPLY
  ========================= */

  await page.getByRole('button', { name: /apply/i }).click().catch(async () => {
    await page.locator('button:has-text("Apply")').click();
  });

  /* =========================
     8️⃣ WAIT FOR AQI APIs
  ========================= */

  await page.waitForTimeout(15000);

  /* =========================
     9️⃣ SAVE API REPORT
  ========================= */

  const docsDir = path.join(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

  fs.writeFileSync(
    path.join(docsDir, 'apis.json'),
    JSON.stringify({
      generatedAt: new Date().toLocaleString(),
      totalApis: capturedApis.length,
      apis: capturedApis
    }, null, 2)
  );

  const rows = capturedApis.map(api => `
    <tr class="${api.status !== 200 ? 'fail' : ''}">
      <td>${api.time}</td>
      <td>${api.method}</td>
      <td>${api.status}</td>
      <td>${api.url}</td>
    </tr>
  `).join('');

  fs.writeFileSync(
    path.join(docsDir, 'index.html'),
    `
<!DOCTYPE html>
<html>
<head>
<title>Envizom API Monitor</title>
<style>
body { font-family: Arial; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 6px; }
.fail { background: #ffcccc; }
</style>
</head>
<body>
<h2>Envizom API Monitor</h2>
<p>Last Run: ${new Date().toLocaleString()}</p>
<p>Total APIs: ${capturedApis.length}</p>
<table>
<tr>
<th>Time</th><th>Method</th><th>Status</th><th>URL</th>
</tr>
${rows}
</table>
</body>
</html>
`
  );

  console.log(`Captured ${capturedApis.length} APIs including AQI flow`);
});
