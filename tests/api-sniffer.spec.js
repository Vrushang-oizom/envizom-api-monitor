const { test } = require('@playwright/test');

test('Envizom Full Flow → Login → AQI → Capture APIs', async ({ page }) => {
  const capturedApis = [];

  /* =========================
     CAPTURE ALL API CALLS
  ========================= */
  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('envdevapi.oizom.com')) {
      capturedApis.push({
        time: new Date().toLocaleTimeString(),
        method: response.request().method(),
        url,
        status: response.status()
      });
    }
  });

  /* =========================
     LOGIN
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

  await page.getByRole('button', { name: /log in/i }).click();

  /* =========================
     WAIT FOR OVERVIEW MAP
  ========================= */
  await page.waitForURL(/overview\/map/, { timeout: 60000 });
  await page.waitForTimeout(6000);

  /* =========================
     GO DIRECTLY TO AQI PAGE
  ========================= */
  await page.goto('https://devenvizom.oizom.com/#/overview/aqi');
  await page.waitForTimeout(8000);

  /* =========================
     SELECT DEVICE TYPE
  ========================= */
  const deviceInput = page.locator('input[formcontrolname="deviceType"]').first();
  await deviceInput.waitFor({ timeout: 60000 });
  await deviceInput.click();

  await page.waitForTimeout(2000);

  const firstOption = page.locator('mat-option').first();
  await firstOption.click();

  /* =========================
     SELECT TODAY DATE
  ========================= */
  const dateInput = page.locator('input[formcontrolname="startDate"]').first();
  await dateInput.click();

  await page.waitForTimeout(1000);

  // Click today's date automatically
  await page.locator('.mat-calendar-body-cell-content').last().click();

  /* =========================
     SELECT PREVIOUS HOUR TIME
  ========================= */
  const timeInput = page.locator('input[formcontrolname="selectedTime"]').first();
  await timeInput.click();

  await page.waitForTimeout(2000);

  const hour = new Date().getHours();
  const previousHour = hour === 0 ? 11 : hour - 1;

  await page.locator(`.clock-face__number span:text("${previousHour}")`).click();

  await page.getByText('Ok').click();

  /* =========================
     CLICK APPLY
  ========================= */
  await page.getByRole('button', { name: /apply/i }).click();

  /* =========================
     CAPTURE AQI APIs
  ========================= */
  await page.waitForTimeout(15000);

  console.log('Total APIs captured:', capturedApis.length);

  capturedApis.forEach(api => {
    console.log(`${api.method} ${api.status} ${api.url}`);
  });
});
