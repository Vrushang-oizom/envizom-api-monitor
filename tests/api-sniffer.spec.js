const { test } = require('@playwright/test');
const fs = require('fs');

test('Envizom Full Flow → Login → AQI → Capture APIs', async ({ page }) => {
  test.setTimeout(240000);

  /* =========================
     API GROUP STORAGE
  ========================= */

  let currentPhase = "login";
  const loginApis = [];
  const aqiApis = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('envdevapi.oizom.com')) return;

    const api = {
      time: new Date().toLocaleString(),
      method: response.request().method(),
      status: response.status(),
      url
    };

    if (currentPhase === "login") loginApis.push(api);
    if (currentPhase === "aqi") aqiApis.push(api);
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

  const agreeBtn = page.getByRole('button', { name: /agree/i });
  if (await agreeBtn.isVisible().catch(() => false)) {
    await agreeBtn.click();
  }

  const loginBtn = page.locator('button:has-text("LOG IN")');

  await page.waitForFunction(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim() === 'LOG IN');
    return btn && !btn.disabled;
  });

  await loginBtn.click();

  // Wait for overview map to load
  await page.waitForURL(/overview\/map/, { timeout: 60000 });

  // Capture login APIs
  await page.waitForTimeout(8000);

  /* =========================
     OPEN AQI VIEW
  ========================= */

  // Click AQI toggle
  await page.locator('text=AQI View').first().click();

  // Wait until URL changes
  await page.waitForURL(/overview\/aqi/, { timeout: 60000 });

  // Let AQI screen fully render
  await page.waitForTimeout(7000);

  /* =========================
     CLICK APPLY
     (THIS IS WHERE AQI APIs FIRE)
  ========================= */

  // Switch capture phase BEFORE apply
  currentPhase = "aqi";

  const applyBtn = page.getByRole('button', { name: /apply/i });
  if (await applyBtn.isVisible().catch(() => false)) {
    await applyBtn.click();
  }

  // Capture AQI APIs
  await page.waitForTimeout(10000);

  /* =========================
     GENERATE REPORT
  ========================= */

  function buildTable(title, data) {
    return `
      <h2 style="margin-top:30px;">${title} (${data.length})</h2>
      <table border="1" cellspacing="0" cellpadding="6" style="width:100%">
        <tr style="background:#111;color:#fff">
          <th>Time</th>
          <th>Status</th>
          <th>Method</th>
          <th>URL</th>
        </tr>
        ${data.map(api => `
          <tr style="background:${api.status === 200 ? '#e8f5e9' : '#ffebee'}">
            <td>${api.time}</td>
            <td>${api.status}</td>
            <td>${api.method}</td>
            <td>${api.url}</td>
          </tr>
        `).join("")}
      </table>
    `;
  }

  const html = `
  <html>
  <head>
    <title>Envizom API Monitor</title>
  </head>
  <body style="font-family:Arial;padding:20px;">
  
    <h1>Envizom API Monitor</h1>
    <p><b>Last Run:</b> ${new Date().toLocaleString()}</p>
  
    ${buildTable("🔐 LOGIN APIs", loginApis)}
    ${buildTable("🌫 OVERVIEW AQI MODULE APIs", aqiApis)}
  
  </body>
  </html>
  `;

  fs.writeFileSync('docs/index.html', html);

  console.log("✅ API report generated");
});
