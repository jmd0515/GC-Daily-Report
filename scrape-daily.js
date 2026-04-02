// scrape-daily.js — Salondata Daily Report Scraper
// Fetches daily reports for current week (Sat-today) for all 4 salons
// Outputs daily_data.json, then generates daily_report.html

require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'https://reports.salondata.com/static/reports/index.html';
const USERNAME = process.env.SALONDATA_USERNAME || 'gm_Jeff.Downing@greatclips.net';
const PASSWORD = process.env.SALONDATA_PASSWORD || 'PDGCofMAN2025$';

const SALONS = [
  { id: '3750', name: 'Publix At County Line Road #3750' },
  { id: '3800', name: 'Publix At Braden River #3800' },
  { id: '3826', name: 'Kings Crossing Publix #3826' },
  { id: '4216', name: 'North River Ranch #4216' },
];

// Week runs Sat-Fri. Get the Saturday that starts the current week.
function getWeekSaturday() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 6=Sat
  const diff = day === 6 ? 0 : day + 1;
  const sat = new Date(today);
  sat.setDate(today.getDate() - diff);
  return sat;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateShort(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getDayName(d) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
}

// Get all dates from Saturday through today (including today for live numbers)
function getWeekDates() {
  const sat = getWeekSaturday();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = [];
  const d = new Date(sat);
  d.setHours(0, 0, 0, 0);
  while (d <= today) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

async function login(page) {
  console.log('Logging in to Salondata...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const userInput = page.locator('input[placeholder="email"]');
  if (await userInput.isVisible({ timeout: 5000 })) {
    await userInput.click();
    await userInput.fill(USERNAME);
    await page.locator('input[placeholder="password"]').click();
    await page.locator('input[placeholder="password"]').fill(PASSWORD);
    await page.locator('#loginButton, button:has-text("Log In")').first().click();
    await page.waitForTimeout(5000);
    console.log('Logged in.');
  }
}

async function scrapeDayAllSalons(page, dateStr) {
  const storeIds = SALONS.map(s => s.id).join(',');
  const hash = `#daily:store=${storeIds}&start=${dateStr}&end=${dateStr}`;
  console.log(`  Fetching ${dateStr}...`);
  await page.goto(BASE_URL + hash, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  return await page.evaluate(() => {
    const fullText = document.body.innerText || '';
    const sections = fullText.split(/Salon Daily Report\n/);
    const results = [];

    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
      const salonLine = lines[0] || '';
      const idMatch = salonLine.match(/#(\d+)/);
      const salonId = idMatch ? idMatch[1] : '';

      // Salon-level metrics
      let custCount = 0;
      const custMatch = section.match(/Service Invoices \(Cust Count\)\s+(\d+)/);
      if (custMatch) custCount = parseInt(custMatch[1]);

      let serviceSales = 0;
      const svcMatch = section.match(/Service Sales\t\$([\d,]+\.\d+)/);
      if (svcMatch) serviceSales = parseFloat(svcMatch[1].replace(/,/g, ''));

      let productSales = 0;
      const prodMatch = section.match(/Product Sales\t\$([\d,]+\.\d+)/);
      if (prodMatch) productSales = parseFloat(prodMatch[1].replace(/,/g, ''));

      let totalSales = 0;
      const totalMatch = section.match(/Total Sales\t\$([\d,]+\.\d+)/);
      if (totalMatch) totalSales = parseFloat(totalMatch[1].replace(/,/g, ''));

      let avgWait = 0;
      const waitMatch = section.match(/Average Wait Time\t(\d+)/);
      if (waitMatch) avgWait = parseInt(waitMatch[1]);

      let waitOver15Pct = 0;
      const wait15Match = section.match(/Wait Times > 15 Min %\t([\d.]+)%/);
      if (wait15Match) waitOver15Pct = parseFloat(wait15Match[1]);

      let custGrowthYoY = 'N/A';
      const cgMatch = section.match(/Customer Count\t([-\d.]+%|N\/A)/);
      if (cgMatch) custGrowthYoY = cgMatch[1];

      let salesGrowthYoY = 'N/A';
      const sgMatch = section.match(/Total Sales\t([-\d.]+%|N\/A)/);
      if (sgMatch) salesGrowthYoY = sgMatch[1];

      // Employee-level parsing
      const employees = [];
      const totalsStart = section.indexOf('Totals/Averages');
      const nameHeaderEnd = section.indexOf('Clip\nNotes\n%');
      if (nameHeaderEnd >= 0 && totalsStart > nameHeaderEnd) {
        const empBlock = section.substring(nameHeaderEnd + 12, totalsStart);
        const empChunks = empBlock.split(/\n\n+/).filter(c => c.trim().length > 5);
        for (const chunk of empChunks) {
          const tokens = chunk.split(/\n/).map(s => s.trim()).filter(Boolean);
          if (tokens.length >= 15) {
            employees.push({
              name: tokens[0],
              position: tokens[1],
              floorHours: parseFloat(tokens[2]) || 0,
              custCount: parseInt(tokens[16]) || 0,
              avgHCTime: parseFloat(tokens[17]) || 0,
              cph: parseFloat(tokens[18]) || 0,
              clipNotesPct: tokens[tokens.length - 1] || '',
            });
          }
        }
      }

      results.push({
        salonId,
        salonName: salonLine,
        custCount,
        serviceSales,
        productSales,
        totalSales,
        avgWait,
        waitOver15Pct,
        custGrowthYoY,
        salesGrowthYoY,
        employees,
      });
    }
    return results;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const ssDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  try {
    await login(page);

    const weekDates = getWeekDates();
    const saturday = getWeekSaturday();
    const friday = new Date(saturday.getTime() + 6 * 86400000);
    console.log(`\nWeek: ${formatDate(saturday)} (Sat) - ${formatDate(friday)} (Fri)`);
    console.log(`Scraping ${weekDates.length} day(s)...\n`);

    const allData = {
      generatedAt: new Date().toISOString(),
      weekStart: formatDate(saturday),
      weekEnd: formatDate(friday),
      weekLabel: `${formatDateShort(saturday)} - ${formatDateShort(friday)}`,
      days: [],
    };

    for (const date of weekDates) {
      const dateStr = formatDate(date);
      const dayData = await scrapeDayAllSalons(page, dateStr);
      allData.days.push({
        date: dateStr,
        dayName: getDayName(date),
        dateShort: formatDateShort(date),
        salons: dayData,
      });
    }

    // Take final screenshot
    await page.screenshot({ path: path.join(ssDir, 'daily_latest.png'), fullPage: true });

    // Save raw data
    const outPath = path.join(__dirname, 'daily_data.json');
    fs.writeFileSync(outPath, JSON.stringify(allData, null, 2), 'utf8');
    console.log(`\nSaved daily data to daily_data.json`);

    // Generate HTML report
    const { generateDailyReport } = require('./generate-daily-report');
    generateDailyReport(allData);
    console.log('Generated daily_report.html');

    // Publish to GitHub Pages as index.html
    try {
      const srcPath = path.join(__dirname, 'daily_report.html');
      const destPath = path.join(__dirname, 'index.html');
      fs.copyFileSync(srcPath, destPath);
      console.log('Copied -> index.html');
      execSync('git add index.html',                           { cwd: __dirname, stdio: 'inherit' });
      execSync('git commit -m "Auto-update daily report"',     { cwd: __dirname, stdio: 'inherit' });
      execSync('git push origin main',                         { cwd: __dirname, stdio: 'inherit' });
      console.log('Pushed to GitHub Pages.');
    } catch (gitErr) {
      console.log('Git push skipped:', gitErr.message.split('\n')[0]);
    }

  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: path.join(ssDir, 'daily_error.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
