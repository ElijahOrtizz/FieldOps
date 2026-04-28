const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.FIELDOPS_URL || "http://localhost:3000";
const EMAIL = process.env.FIELDOPS_EMAIL || "admin@fieldops.com";
const PASSWORD = process.env.FIELDOPS_PASSWORD || "admin123";

const screenshotsDir = path.resolve(__dirname, "../../screenshots");
fs.mkdirSync(screenshotsDir, { recursive: true });

const pages = [
  ["01-dashboard", "/admin/dashboard"],
  ["02-crew-schedule", "/admin/crew-schedule"],
  ["03-worker-dashboard", "/worker"],
  ["04-daily-review", "/admin/daily-review"],
  ["05-weekly-timecards", "/admin/weekly-timecards"],
  ["06-paynet-export-readiness", "/admin/export"],
  ["07-job-costing", "/admin/reports"],
  ["08-integration-center", "/admin/integrations"],
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  console.log("Opening app...");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"], input[placeholder*="password" i]').first();

  if (await emailInput.count()) {
    console.log("Logging in...");
    await emailInput.fill(EMAIL);
    await passwordInput.fill(PASSWORD);
    await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")').first().click();
    await page.waitForTimeout(2000);
  } else {
    console.log("No login form found; continuing.");
  }

  for (const [name, route] of pages) {
    const url = `${BASE_URL}${route}`;
    const filePath = path.join(screenshotsDir, `${name}.png`);

    try {
      console.log(`Capturing ${route}`);
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: filePath, fullPage: true });
      console.log(`Saved ${filePath}`);
    } catch (err) {
      console.log(`Failed ${route}: ${err.message}`);
    }
  }

  await browser.close();
  console.log("Done. Screenshots saved to /screenshots");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


