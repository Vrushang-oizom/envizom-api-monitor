const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../discovered-apis/apis.json');
const outputPath = path.join(__dirname, '../docs/index.html');

if (!fs.existsSync(dataPath)) {
  console.error('❌ No API data found');
  process.exit(1);
}

const apis = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const rows = apis.map(api => `
<tr>
  <td>${api.method}</td>
  <td>${api.url}</td>
  <td style="color:${api.status === 200 ? 'green' : 'red'}">
    ${api.status}
  </td>
  <td>${api.time}</td>
</tr>
`).join('');

const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Envizom API Monitor</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 8px; }
    th { background: #f0f0f0; }
  </style>
</head>
<body>
  <h1>Envizom API Monitor</h1>
  <p>Last updated: ${new Date().toLocaleString()}</p>
  <table>
    <tr>
      <th>Method</th>
      <th>URL</th>
      <th>Status</th>
      <th>Time</th>
    </tr>
    ${rows}
  </table>
</body>
</html>
`;

fs.writeFileSync(outputPath, html);
console.log('✅ HTML report generated');
