// generate-daily-report.js — Generates daily_report.html from daily_data.json
// Shows WTD customer counts (Sat-Fri week), daily breakdown, and per-stylist metrics

const fs = require('fs');
const path = require('path');

function generateDailyReport(data) {
  if (!data) {
    const jsonPath = path.join(__dirname, 'daily_data.json');
    if (!fs.existsSync(jsonPath)) { console.error('No daily_data.json found.'); return; }
    data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }

  const salonIds = ['3750', '3800', '3826', '4216'];
  const salonShortNames = {
    '3750': 'County Line #3750',
    '3800': 'Braden River #3800',
    '3826': 'Kings Crossing #3826',
    '4216': 'North River Ranch #4216',
  };

  // Build WTD aggregates per salon
  const wtd = {};
  for (const id of salonIds) {
    wtd[id] = {
      custCount: 0,
      serviceSales: 0,
      productSales: 0,
      totalSales: 0,
      avgWaitSum: 0,
      avgWaitDays: 0,
      waitOver15Sum: 0,
      days: [],
      employeeWTD: {}, // name -> { custCount, floorHours, cph, avgHCSum, avgHCDays }
    };
  }

  for (const day of data.days) {
    for (const salon of day.salons) {
      const w = wtd[salon.salonId];
      if (!w) continue;
      w.custCount += salon.custCount;
      w.serviceSales += salon.serviceSales;
      w.productSales += salon.productSales;
      w.totalSales += salon.totalSales;
      if (salon.avgWait > 0) { w.avgWaitSum += salon.avgWait; w.avgWaitDays++; }
      w.waitOver15Sum += salon.waitOver15Pct;
      w.days.push({
        date: day.date,
        dayName: day.dayName,
        dateShort: day.dateShort,
        custCount: salon.custCount,
        totalSales: salon.totalSales,
        avgWait: salon.avgWait,
        waitOver15Pct: salon.waitOver15Pct,
        custGrowthYoY: salon.custGrowthYoY,
        salesGrowthYoY: salon.salesGrowthYoY,
        employees: salon.employees,
      });

      // Accumulate employee WTD
      for (const emp of salon.employees) {
        if (!w.employeeWTD[emp.name]) {
          w.employeeWTD[emp.name] = { position: emp.position, custCount: 0, floorHours: 0, cphSum: 0, cphDays: 0, avgHCSum: 0, avgHCDays: 0 };
        }
        const e = w.employeeWTD[emp.name];
        e.custCount += emp.custCount;
        e.floorHours += emp.floorHours;
        if (emp.cph > 0) { e.cphSum += emp.cph; e.cphDays++; }
        if (emp.avgHCTime > 0) { e.avgHCSum += emp.avgHCTime; e.avgHCDays++; }
      }
    }
  }

  // Most recent day for "today" display
  const latestDay = data.days[data.days.length - 1];
  const latestDateLabel = latestDay ? `${latestDay.dayName}, ${latestDay.dateShort}` : '';

  // Build salon panels HTML
  let salonPanels = '';
  for (const id of salonIds) {
    const w = wtd[id];
    const shortName = salonShortNames[id];
    const latest = latestDay ? latestDay.salons.find(s => s.salonId === id) : null;
    const avgWaitWTD = w.avgWaitDays > 0 ? Math.round(w.avgWaitSum / w.avgWaitDays) : 0;
    const avgWait15WTD = w.days.length > 0 ? (w.waitOver15Sum / w.days.length).toFixed(1) : '0.0';

    // KPI cards
    const kpiHTML = `
      <div class="kpi-row">
        <div class="kpi-card" style="--accent-color:#22c55e">
          <div class="kpi-label">WTD Customers</div>
          <div class="kpi-value">${w.custCount}</div>
          <div class="kpi-sub">${w.days.length} day${w.days.length !== 1 ? 's' : ''} reported</div>
        </div>
        <div class="kpi-card" style="--accent-color:#38bdf8">
          <div class="kpi-label">WTD Total Sales</div>
          <div class="kpi-value">$${w.totalSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div class="kpi-sub">Svc: $${w.serviceSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
        </div>
        <div class="kpi-card" style="--accent-color:#f59e0b">
          <div class="kpi-label">Avg Wait (WTD)</div>
          <div class="kpi-value">${avgWaitWTD}<span> min</span></div>
          <div class="kpi-sub">&gt;15 min: ${avgWait15WTD}%</div>
        </div>
        <div class="kpi-card" style="--accent-color:#8b5cf6">
          <div class="kpi-label">Latest Day</div>
          <div class="kpi-value">${latest ? latest.custCount : '--'}</div>
          <div class="kpi-sub">${latestDateLabel}${latest ? ` | YoY: ${latest.custGrowthYoY}` : ''}</div>
        </div>
      </div>`;

    // Daily breakdown table
    let dailyRows = '';
    for (const day of w.days) {
      const growthBadge = day.custGrowthYoY === 'N/A' ? '<span class="badge blue">N/A</span>'
        : day.custGrowthYoY.startsWith('-') ? `<span class="badge red">${day.custGrowthYoY}</span>`
        : `<span class="badge green">${day.custGrowthYoY}</span>`;
      const salesGrowth = day.salesGrowthYoY === 'N/A' ? '<span class="badge blue">N/A</span>'
        : day.salesGrowthYoY.startsWith('-') ? `<span class="badge red">${day.salesGrowthYoY}</span>`
        : `<span class="badge green">${day.salesGrowthYoY}</span>`;
      const waitClass = day.avgWait > 15 ? 'red' : day.avgWait > 8 ? 'yellow' : 'green';
      const wait15Class = day.waitOver15Pct > 10 ? 'red' : day.waitOver15Pct > 5 ? 'yellow' : 'green';

      dailyRows += `
        <tr>
          <td class="bold">${day.dayName.substring(0, 3)} ${day.dateShort}</td>
          <td class="right mono">${day.custCount}</td>
          <td class="right mono">$${day.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td class="right">${growthBadge}</td>
          <td class="right">${salesGrowth}</td>
          <td class="right"><span class="badge ${waitClass}">${day.avgWait} min</span></td>
          <td class="right"><span class="badge ${wait15Class}">${day.waitOver15Pct}%</span></td>
        </tr>`;
    }

    // WTD totals row
    const wtdWaitClass = avgWaitWTD > 15 ? 'red' : avgWaitWTD > 8 ? 'yellow' : 'green';
    const wtdWait15Class = parseFloat(avgWait15WTD) > 10 ? 'red' : parseFloat(avgWait15WTD) > 5 ? 'yellow' : 'green';
    dailyRows += `
      <tr class="totals-row">
        <td class="bold">WTD Total</td>
        <td class="right mono bold">${w.custCount}</td>
        <td class="right mono bold">$${w.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="right"></td>
        <td class="right"></td>
        <td class="right"><span class="badge ${wtdWaitClass}">${avgWaitWTD} avg</span></td>
        <td class="right"><span class="badge ${wtdWait15Class}">${avgWait15WTD}%</span></td>
      </tr>`;

    // Employee WTD table
    let empRows = '';
    const empList = Object.entries(w.employeeWTD)
      .map(([name, e]) => ({
        name,
        position: e.position,
        custCount: e.custCount,
        floorHours: e.floorHours,
        avgCPH: e.cphDays > 0 ? (e.cphSum / e.cphDays).toFixed(1) : '--',
        avgHCTime: e.avgHCDays > 0 ? (e.avgHCSum / e.avgHCDays).toFixed(1) : '--',
      }))
      .sort((a, b) => b.custCount - a.custCount);

    for (const emp of empList) {
      const cphVal = parseFloat(emp.avgCPH);
      const cphClass = isNaN(cphVal) ? '' : cphVal >= 2.0 ? 'green' : cphVal >= 1.5 ? 'yellow' : 'red';
      const hcVal = parseFloat(emp.avgHCTime);
      const hcClass = isNaN(hcVal) ? '' : hcVal <= 15 ? 'green' : hcVal <= 20 ? 'yellow' : 'red';

      empRows += `
        <tr>
          <td class="bold">${emp.name}</td>
          <td class="right mono">${emp.position}</td>
          <td class="right mono">${emp.custCount}</td>
          <td class="right mono">${emp.floorHours.toFixed(1)}</td>
          <td class="right"><span class="badge ${cphClass}">${emp.avgCPH}</span></td>
          <td class="right"><span class="badge ${hcClass}">${emp.avgHCTime}</span></td>
        </tr>`;
    }

    // Per-day stylist detail (expandable)
    let dailyDetailHTML = '';
    for (const day of w.days) {
      let detailRows = '';
      const sorted = [...day.employees].sort((a, b) => b.custCount - a.custCount);
      for (const emp of sorted) {
        const cphClass = emp.cph >= 2.0 ? 'green' : emp.cph >= 1.5 ? 'yellow' : 'red';
        const hcClass = emp.avgHCTime <= 15 ? 'green' : emp.avgHCTime <= 20 ? 'yellow' : 'red';
        detailRows += `
          <tr>
            <td class="bold">${emp.name}</td>
            <td class="right mono">${emp.custCount}</td>
            <td class="right mono">${emp.floorHours.toFixed(1)}</td>
            <td class="right"><span class="badge ${cphClass}">${emp.cph}</span></td>
            <td class="right"><span class="badge ${hcClass}">${emp.avgHCTime}</span></td>
            <td class="right mono">${emp.clipNotesPct}</td>
          </tr>`;
      }

      dailyDetailHTML += `
        <div class="day-detail" data-salon="${id}">
          <button class="day-toggle" onclick="toggleDay(this)">
            <span>${day.dayName.substring(0, 3)} ${day.dateShort} - ${day.custCount} customers</span>
            <span class="chevron">&#9660;</span>
          </button>
          <div class="day-content" style="display:none">
            <table>
              <thead><tr>
                <th>Stylist</th><th class="right">Cust</th><th class="right">Floor Hrs</th>
                <th class="right">CPH</th><th class="right">Avg HC</th><th class="right">Clip Notes</th>
              </tr></thead>
              <tbody>${detailRows}</tbody>
            </table>
          </div>
        </div>`;
    }

    salonPanels += `
      <div class="salon-panel ${id === '3750' ? 'active' : ''}" data-salon="${id}">
        ${kpiHTML}

        <div class="section-label">Daily Breakdown</div>
        <div class="table-card">
          <table>
            <thead><tr>
              <th>Day</th><th class="right">Cust</th><th class="right">Total Sales</th>
              <th class="right">Cust YoY</th><th class="right">Sales YoY</th>
              <th class="right">Avg Wait</th><th class="right">&gt;15 Min</th>
            </tr></thead>
            <tbody>${dailyRows}</tbody>
          </table>
        </div>

        <div class="section-label" style="margin-top:20px">Stylist WTD Summary</div>
        <div class="table-card">
          <table>
            <thead><tr>
              <th>Stylist</th><th class="right">Pos</th><th class="right">WTD Cust</th>
              <th class="right">WTD Floor Hrs</th><th class="right">Avg CPH</th><th class="right">Avg HC Time</th>
            </tr></thead>
            <tbody>${empRows}</tbody>
          </table>
        </div>

        <div class="section-label" style="margin-top:20px">Daily Detail</div>
        ${dailyDetailHTML}
      </div>`;
  }

  // Build WTD summary bar across all salons
  let totalCust = 0, totalSales = 0;
  for (const id of salonIds) { totalCust += wtd[id].custCount; totalSales += wtd[id].totalSales; }

  let summaryChips = '';
  for (const id of salonIds) {
    summaryChips += `<div class="summary-chip"><span class="chip-label">${salonShortNames[id]}</span><span class="chip-value">${wtd[id].custCount}</span></div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>GC Daily Report - Week of ${data.weekLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:#0d0f14;--surface:#161920;--surface2:#1e2229;--border:#2a2f3a;
    --text:#e8eaf0;--muted:#7a8099;--gc-blue:#0066cc;
    --green:#22c55e;--yellow:#f59e0b;--red:#ef4444;--accent:#38bdf8;
    --font-mono:'DM Mono',monospace;--font-sans:'DM Sans',sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:var(--font-sans);min-height:100vh;-webkit-font-smoothing:antialiased}

  header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 16px;display:flex;align-items:center;justify-content:space-between;height:56px;position:sticky;top:0;z-index:100}
  .logo{display:flex;align-items:center;gap:10px}
  .logo-icon{width:32px;height:32px;background:var(--gc-blue);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:white;font-family:var(--font-mono)}
  .logo-text{font-size:14px;font-weight:600}
  .logo-sub{font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
  .week-badge{background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:4px 10px;font-size:10px;font-family:var(--font-mono);color:var(--accent);white-space:nowrap}

  .summary-bar{display:flex;gap:8px;padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border);overflow-x:auto;align-items:center}
  .summary-total{font-family:var(--font-mono);font-size:18px;font-weight:600;color:var(--text);padding-right:12px;border-right:1px solid var(--border);margin-right:4px;white-space:nowrap}
  .summary-total small{font-size:10px;color:var(--muted);font-weight:400;display:block}
  .summary-chip{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;text-align:center;min-width:80px;flex-shrink:0}
  .chip-label{font-size:9px;color:var(--muted);display:block;white-space:nowrap}
  .chip-value{font-family:var(--font-mono);font-size:16px;font-weight:500;color:var(--text)}

  .salon-tabs{display:flex;background:var(--surface);border-bottom:1px solid var(--border);overflow-x:auto;scrollbar-width:none}
  .salon-tabs::-webkit-scrollbar{display:none}
  .tab-btn{background:none;border:none;color:var(--muted);font-family:var(--font-sans);font-size:12px;font-weight:500;padding:10px 16px 11px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap;flex-shrink:0}
  .tab-btn:hover{color:var(--text)}
  .tab-btn.active{color:var(--text);border-bottom-color:var(--gc-blue)}
  .tab-num{font-family:var(--font-mono);font-size:9px;color:var(--gc-blue);display:block;margin-bottom:1px}

  .main{padding:16px;max-width:960px;margin:0 auto}
  .salon-panel{display:none}
  .salon-panel.active{display:block}

  .section-label{font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;padding-left:2px}
  .kpi-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
  @media(min-width:600px){.kpi-row{grid-template-columns:repeat(4,1fr)}}
  .kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;position:relative;overflow:hidden}
  .kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent-color,var(--gc-blue))}
  .kpi-label{font-size:9px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
  .kpi-value{font-family:var(--font-mono);font-size:26px;font-weight:500;color:var(--text);line-height:1}
  .kpi-value span{font-size:12px;color:var(--muted)}
  .kpi-sub{font-size:10px;color:var(--muted);margin-top:5px}

  .table-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th{padding:9px 12px;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;border-bottom:1px solid var(--border);background:var(--surface2);white-space:nowrap}
  th.right{text-align:right}
  td{padding:9px 12px;font-size:12px;border-bottom:1px solid rgba(42,47,58,.6);vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:rgba(255,255,255,.02)}
  td.right{text-align:right}
  td.bold{font-weight:500}
  td.mono,.mono{font-family:var(--font-mono)}
  .totals-row td{border-top:2px solid var(--gc-blue);background:rgba(0,102,204,.05);font-weight:600}

  .badge{display:inline-block;font-family:var(--font-mono);font-size:9px;padding:1px 5px;border-radius:3px;font-weight:500}
  .badge.green{background:rgba(34,197,94,.15);color:#4ade80}
  .badge.red{background:rgba(239,68,68,.15);color:#f87171}
  .badge.yellow{background:rgba(245,158,11,.15);color:#fbbf24}
  .badge.blue{background:rgba(56,189,248,.15);color:var(--accent)}

  .day-detail{background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden}
  .day-toggle{width:100%;background:none;border:none;color:var(--text);font-family:var(--font-sans);font-size:12px;font-weight:500;padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;text-align:left}
  .day-toggle:hover{background:var(--surface2)}
  .chevron{font-size:10px;color:var(--muted);transition:transform .2s}
  .chevron.open{transform:rotate(180deg)}
  .day-content{border-top:1px solid var(--border)}

  .gen-time{text-align:center;padding:20px 0;font-size:10px;color:var(--muted);font-family:var(--font-mono)}
</style>
</head>
<body>

<header>
  <div class="logo">
    <div class="logo-icon">GC</div>
    <div>
      <div class="logo-text">Daily Report</div>
      <div class="logo-sub">Week-to-Date</div>
    </div>
  </div>
  <div class="week-badge">WK ${data.weekLabel}</div>
</header>

<div class="summary-bar">
  <div class="summary-total"><small>WTD TOTAL</small>${totalCust}</div>
  ${summaryChips}
</div>

<div class="salon-tabs">
  ${salonIds.map((id, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" onclick="selectSalon('${id}')"><span class="tab-num">#${id}</span>${salonShortNames[id].split('#')[0].trim()}</button>`).join('')}
</div>

<div class="main">
  ${salonPanels}
</div>

<div class="gen-time">Generated ${new Date(data.generatedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })}</div>

<script>
function selectSalon(id) {
  document.querySelectorAll('.salon-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const panel = document.querySelector('.salon-panel[data-salon="'+id+'"]');
  if (panel) panel.classList.add('active');
  // Find the matching tab
  const tabs = document.querySelectorAll('.tab-btn');
  const ids = ${JSON.stringify(salonIds)};
  const idx = ids.indexOf(id);
  if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');
}

function toggleDay(btn) {
  const content = btn.nextElementSibling;
  const chevron = btn.querySelector('.chevron');
  if (content.style.display === 'none') {
    content.style.display = 'block';
    chevron.classList.add('open');
  } else {
    content.style.display = 'none';
    chevron.classList.remove('open');
  }
}
</script>

</body>
</html>`;

  const outPath = path.join(__dirname, 'daily_report.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

// Allow standalone run
if (require.main === module) {
  generateDailyReport();
  console.log('Generated daily_report.html');
}

module.exports = { generateDailyReport };
