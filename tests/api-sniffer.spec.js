const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('Envizom API Monitor', async ({ page }) => {
  if (!process.env.ENVIZOM_EMAIL || !process.env.ENVIZOM_PASSWORD) {
    throw new Error('❌ Missing ENVIZOM credentials');
  }

  const capturedApis = [];
  const seen = new Set();

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

  // 🔐 LOGIN
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

  // ⏳ LET APIs FIRE
  await page.waitForTimeout(15000);

  // 📁 SAVE JSON
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

  // 🌐 GENERATE HTML
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
<h1>Envizom API Monitor</h1>
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

  console.log(`✅ Captured ${capturedApis.length} APIs`);
});

