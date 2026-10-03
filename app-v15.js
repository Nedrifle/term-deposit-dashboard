const STORAGE_KEY = "term-deposit-dashboard-v1";
const SURPLUS_STORAGE_KEY = "term-deposit-surplus-v1";
const SURPLUS_TAX_RATE = 20.315;
const SUPPORTED_FOREIGN_CURRENCY = "USD";
const state = {
  deposits: loadDeposits(),
  surplusFunds: loadSurplusFunds(),
  taxMode: "net",
};

const els = {
  dialog: document.querySelector("#depositDialog"),
  form: document.querySelector("#depositForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  add: document.querySelector("#addDepositButton"),
  close: document.querySelector("#closeDialogButton"),
  cancel: document.querySelector("#cancelButton"),
  list: document.querySelector("#depositList"),
  empty: document.querySelector("#emptyMessage"),
  template: document.querySelector("#depositCardTemplate"),
  chart: document.querySelector("#interestChart"),
  profitChart: document.querySelector("#profitChart"),
  yieldChart: document.querySelector("#yieldChart"),
  taxMode: document.querySelector("#taxMode"),
  manualUsdRate: document.querySelector("#manualUsdRate"),
  applyFxRate: document.querySelector("#applyFxRateButton"),
  surplusAmount: document.querySelector("#surplusAmount"),
  surplusAnnualRate: document.querySelector("#surplusAnnualRate"),
  surplusDailyInterest: document.querySelector("#surplusDailyInterest"),
  surplusDailyInterestNet: document.querySelector("#surplusDailyInterestNet"),
  clearSurplus: document.querySelector("#clearSurplusButton"),
  export: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
};

function loadDeposits() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(parsed)) return parsed.map(normalizeDeposit);
  } catch (e) {}
  return [];
}

function loadSurplusFunds() {
  try {
    const saved = JSON.parse(localStorage.getItem(SURPLUS_STORAGE_KEY));
    return {
      amount: Math.max(0, Number(saved?.amount) || 0),
      annualRate: Math.max(0, Number(saved?.annualRate) || 0),
    };
  } catch (e) {
    return { amount: 0, annualRate: 0 };
  }
}

function saveSurplusFunds() {
  localStorage.setItem(SURPLUS_STORAGE_KEY, JSON.stringify(state.surplusFunds));
}

function normalizeDeposit(deposit) {
  const currency = deposit.currency || "JPY";
  const fxRate = currency === "JPY" ? 1 : Number(deposit.fxRate || deposit.initialFxRate || 1);
  return {
    ...deposit,
    id: deposit.id || crypto.randomUUID(),
    currency,
    principal: Number(deposit.principal || 0),
    annualRate: Number(deposit.annualRate || 0),
    dayBasis: Number(deposit.dayBasis || 365),
    taxRate: Number(deposit.taxRate ?? 20.315),
    initialFxRate: currency === "JPY" ? 1 : Number(deposit.initialFxRate || fxRate),
    fxRate,
    interestReceiptFxRate: currency === "JPY" ? 1 : Number(deposit.interestReceiptFxRate || 0),
    conversionFxRate: currency === "JPY" ? 1 : Number(deposit.conversionFxRate || 0),
    afterMaturity: deposit.afterMaturity || "close",
    fxUpdatedAt: deposit.fxUpdatedAt || "",
  };
}

function saveDeposits() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.deposits));
}

function dateAtMidnight(value) {
  const d = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  d.setHours(0,0,0,0);
  return d;
}

function addDays(date, n) {
  const d = dateAtMidnight(date);
  d.setDate(d.getDate() + n);
  return d;
}

function diffDays(from, to) {
  return Math.round((dateAtMidnight(to) - dateAtMidnight(from)) / 86400000);
}

function isActiveOn(deposit, date) {
  const d = dateAtMidnight(date);
  return d > dateAtMidnight(deposit.startDate) && d <= dateAtMidnight(deposit.maturityDate);
}

function isHeldOn(deposit, date) {
  const d = dateAtMidnight(date);
  return d >= dateAtMidnight(deposit.startDate) && d <= dateAtMidnight(deposit.maturityDate);
}

function isMaturedOn(deposit, date = new Date()) {
  return dateAtMidnight(date) > dateAtMidnight(deposit.maturityDate);
}

function grossDailyInterest(deposit) {
  return Number(deposit.principal) * (Number(deposit.annualRate) / 100) / Number(deposit.dayBasis);
}

function accruedInterestDays(deposit, date = new Date()) {
  const start = dateAtMidnight(deposit.startDate);
  const end = new Date(Math.min(dateAtMidnight(date), dateAtMidnight(deposit.maturityDate)));
  return Math.max(0, diffDays(start, end));
}

function accruedNetInterest(deposit, date = new Date()) {
  return netDailyInterest(deposit) * accruedInterestDays(deposit, date);
}

function netDailyInterest(deposit) {
  return grossDailyInterest(deposit) * (1 - Number(deposit.taxRate) / 100);
}

function convertToYen(value, deposit) {
  return value * Number(deposit.fxRate || 1);
}

function convertToInitialYen(value, deposit) {
  return value * Number(deposit.initialFxRate || deposit.fxRate || 1);
}

function maturityNetInterest(deposit) {
  return netDailyInterest(deposit) * Math.max(0, diffDays(deposit.startDate, deposit.maturityDate));
}

function interestConversionRate(deposit, date = new Date()) {
  if (deposit.currency === "JPY") return 1;
  if (isMaturedOn(deposit, date) && Number(deposit.interestReceiptFxRate) > 0) {
    return Number(deposit.interestReceiptFxRate);
  }
  return Number(deposit.fxRate || 1);
}

function principalValuationRate(deposit, date = new Date()) {
  if (deposit.currency === "JPY") return 1;
  if (isMaturedOn(deposit, date) && Number(deposit.conversionFxRate) > 0) {
    return Number(deposit.conversionFxRate);
  }
  return Number(deposit.fxRate || 1);
}

function principalFxGainLoss(deposit, date = new Date()) {
  if (deposit.currency === "JPY") return 0;
  if (isMaturedOn(deposit, date) && Number(deposit.conversionFxRate) <= 0) return 0;
  return Number(deposit.principal) * (principalValuationRate(deposit, date) - Number(deposit.initialFxRate));
}

function interestFxGainLoss(deposit, date = new Date()) {
  if (deposit.currency === "JPY" || !isMaturedOn(deposit, date)) return 0;
  const receiptRate = Number(deposit.interestReceiptFxRate);
  const conversionRate = Number(deposit.conversionFxRate);
  if (receiptRate <= 0 || conversionRate <= 0) return 0;
  return maturityNetInterest(deposit) * (conversionRate - receiptRate);
}

function dailyInterestFor(deposit, date, net = true) {
  if (!isActiveOn(deposit, date)) return 0;
  const native = net ? netDailyInterest(deposit) : grossDailyInterest(deposit);
  return native * interestConversionRate(deposit);
}

function totalInterestOn(date, net = true) {
  return state.deposits.reduce((sum, d) => sum + dailyInterestFor(d, date, net), 0);
}

function cumulativeInterest(from, to, net = true) {
  let total = 0;
  for (let d = dateAtMidnight(from); d <= dateAtMidnight(to); d = addDays(d, 1)) {
    total += totalInterestOn(d, net);
  }
  return total;
}

function fxGainLoss(deposits = state.deposits, date = new Date()) {
  return deposits.reduce((sum, d) => {
    if (d.currency !== SUPPORTED_FOREIGN_CURRENCY) return sum;
    if (isMaturedOn(d, date)) return sum + principalFxGainLoss(d, date) + interestFxGainLoss(d, date);
    if (!isHeldOn(d, date)) return sum;
    return sum + principalFxGainLoss(d, date);
  }, 0);
}

function foreignDeposits(date = new Date()) {
  return state.deposits.filter(d => d.currency === SUPPORTED_FOREIGN_CURRENCY && isHeldOn(d, date));
}

function formatYen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency", currency: "JPY", maximumFractionDigits: 0
  }).format(value || 0);
}

function formatYenPrecise(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency", currency: "JPY", minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value || 0);
}

function formatCompactYen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency", currency: "JPY", notation: "compact", maximumFractionDigits: 1
  }).format(value || 0);
}

function formatNative(value, currency) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency", currency, maximumFractionDigits: currency === "JPY" ? 0 : 2
  }).format(value || 0);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(dateAtMidnight(date));
}

function renderSummary() {
  const today = dateAtMidnight(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const todayNet = totalInterestOn(today, true);
  const todayGross = totalInterestOn(today, false);
  const monthNet = cumulativeInterest(monthStart, today, true);
  const monthGross = cumulativeInterest(monthStart, today, false);
  const active = state.deposits.filter(d => isActiveOn(d, today));
  const principalYen = active.reduce((sum, d) => sum + convertToYen(Number(d.principal), d), 0);
  const fxTotal = fxGainLoss();
  const fxCard = document.querySelector(".fx-featured");
  const foreign = foreignDeposits();
  const maturedForeign = state.deposits.filter(d => d.currency === SUPPORTED_FOREIGN_CURRENCY && isMaturedOn(d, today));
  const settledForeign = maturedForeign.filter(d => Number(d.interestReceiptFxRate) > 0 && Number(d.conversionFxRate) > 0);
  const pendingForeign = maturedForeign.length - settledForeign.length;
  const currentRates = [...new Set(foreign.map(d => Number(d.fxRate)))];
  const currentRateText = currentRates.length === 1 ? `｜現在 ${currentRates[0]}円` : currentRates.length > 1 ? "｜現在レート複数" : "";
  if (currentRates.length === 1 && document.activeElement !== els.manualUsdRate) {
    els.manualUsdRate.value = currentRates[0];
  }

  document.querySelector("#fxGainLoss").textContent = formatYen(fxTotal);
  const activeStatus = foreign.length
    ? `運用中 ${foreign.length}件（元本 ${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(foreign.reduce((sum, d) => sum + Number(d.principal), 0))} USD）${currentRateText}`
    : "運用中なし";
  const maturedStatus = maturedForeign.length
    ? `｜満期済み算定 ${settledForeign.length}件${pendingForeign ? `・要入力 ${pendingForeign}件` : ""}`
    : "";
  document.querySelector("#fxRateStatus").textContent = `${activeStatus}${maturedStatus}`;
  fxCard.classList.toggle("positive", fxTotal > 0);
  fxCard.classList.toggle("negative", fxTotal < 0);
  document.querySelector("#todayInterest").textContent = formatYen(todayNet);
  document.querySelector("#todayInterestGross").textContent = `税引前 ${formatYen(todayGross)}`;
  document.querySelector("#monthInterest").textContent = formatYen(monthNet);
  document.querySelector("#monthInterestGross").textContent = `税引前 ${formatYen(monthGross)}`;
  document.querySelector("#activeDepositCount").textContent = `${active.length}件`;
  document.querySelector("#totalPrincipal").textContent = `元本合計 ${formatYen(principalYen)}`;
}

function renderSurplusFunds() {
  const dailyInterest = state.surplusFunds.amount * (state.surplusFunds.annualRate / 100) / 365;
  const netDailyInterest = dailyInterest * (1 - SURPLUS_TAX_RATE / 100);
  els.surplusDailyInterest.textContent = formatYenPrecise(dailyInterest);
  els.surplusDailyInterestNet.textContent = `（税引後 ${formatYenPrecise(netDailyInterest)}）`;
}

function renderDeposits() {
  els.list.innerHTML = "";
  const today = dateAtMidnight(new Date());
  const sorted = [...state.deposits].sort((a,b) => {
    const aMatured = today > dateAtMidnight(a.maturityDate);
    const bMatured = today > dateAtMidnight(b.maturityDate);
    if (aMatured !== bMatured) return aMatured ? 1 : -1;
    return dateAtMidnight(a.maturityDate) - dateAtMidnight(b.maturityDate);
  });
  els.empty.hidden = sorted.length > 0;

  sorted.forEach(deposit => {
    const node = els.template.content.cloneNode(true);
    const start = dateAtMidnight(deposit.startDate);
    const maturity = dateAtMidnight(deposit.maturityDate);
    const totalDays = Math.max(1, diffDays(start, maturity));
    const elapsed = Math.min(totalDays, Math.max(0, diffDays(start, today)));
    const progress = Math.round((elapsed / totalDays) * 100);
    const interestDays = Math.max(0, diffDays(start, maturity));
    const grossAtMaturity = grossDailyInterest(deposit) * interestDays;
    const netAtMaturity = netDailyInterest(deposit) * interestDays;
    const todayNetNative = isActiveOn(deposit, today) ? netDailyInterest(deposit) : 0;
    const accruedNetNative = accruedNetInterest(deposit, today);
    const matured = isMaturedOn(deposit, today);
    const interestRate = interestConversionRate(deposit, today);
    const principalRate = principalValuationRate(deposit, today);
    const accruedNetYen = accruedNetNative * interestRate;
    const status = today <= start ? "開始前" : matured ? "満期済み" : "運用中";
    const remaining = matured ? "満期済み" : `${Math.max(0,diffDays(today,maturity))}日`;
    const rateText = deposit.currency === "JPY"
      ? ""
      : matured
        ? `｜預入時 ${deposit.initialFxRate}円｜利息受取時 ${Number(deposit.interestReceiptFxRate) > 0 ? `${deposit.interestReceiptFxRate}円` : "未入力"}｜円転時 ${Number(deposit.conversionFxRate) > 0 ? `${deposit.conversionFxRate}円` : "未入力"}`
        : `｜預入時 ${deposit.initialFxRate}円｜現在 ${deposit.fxRate}円`;

    node.querySelector(".currency-badge").textContent = `${deposit.currency}・${status}`;
    node.querySelector(".deposit-title").textContent = deposit.productName;
    node.querySelector(".deposit-subtitle").textContent = `${deposit.bankName}｜${deposit.startDate} → ${deposit.maturityDate}`;
    node.querySelector(".principal-value").textContent = deposit.currency === "JPY"
      ? formatYen(Number(deposit.principal))
      : `${formatNative(Number(deposit.principal), deposit.currency)}（${formatYen(Number(deposit.principal) * principalRate)}）`;
    node.querySelector(".daily-value").textContent = deposit.currency === "JPY"
      ? `${formatYen(todayNetNative)} / 日`
      : `${formatNative(todayNetNative, deposit.currency)}（${formatYen(todayNetNative * interestRate)}） / 日`;
    node.querySelector(".accrued-interest-value").textContent = formatYenPrecise(accruedNetYen);
    const fxMetric = node.querySelector(".principal-fx-metric");
    const individualFxGainLoss = principalFxGainLoss(deposit, today);
    fxMetric.hidden = deposit.currency === "JPY";
    fxMetric.querySelector(".principal-fx-value").textContent = matured && Number(deposit.conversionFxRate) <= 0
      ? "円転時レート未入力"
      : formatYen(individualFxGainLoss);
    fxMetric.classList.toggle("positive", individualFxGainLoss > 0);
    fxMetric.classList.toggle("negative", individualFxGainLoss < 0);
    const interestFxMetric = node.querySelector(".interest-fx-metric");
    const individualInterestFxGainLoss = interestFxGainLoss(deposit, today);
    interestFxMetric.hidden = deposit.currency === "JPY" || !matured;
    interestFxMetric.querySelector(".interest-fx-value").textContent = Number(deposit.interestReceiptFxRate) <= 0 || Number(deposit.conversionFxRate) <= 0
      ? "為替レート未入力"
      : formatYen(individualInterestFxGainLoss);
    interestFxMetric.classList.toggle("positive", individualInterestFxGainLoss > 0);
    interestFxMetric.classList.toggle("negative", individualInterestFxGainLoss < 0);
    node.querySelector(".maturity-value").textContent = deposit.currency === "JPY"
      ? formatYen(Number(deposit.principal) + netAtMaturity)
      : `${formatNative(Number(deposit.principal) + netAtMaturity, deposit.currency)}（${formatYen(Number(deposit.principal) * principalRate + netAtMaturity * interestRate)}）`;
    node.querySelector(".remaining-days").textContent = remaining;
    node.querySelector(".progress-bar").style.width = `${progress}%`;
    node.querySelector(".deposit-note").textContent =
      `年利 ${deposit.annualRate}%｜税率 ${deposit.taxRate}%${rateText}`;

    node.querySelector(".edit-button").addEventListener("click", () => openDialog(deposit));
    node.querySelector(".delete-button").addEventListener("click", () => {
      if (confirm(`${deposit.productName}を削除しますか？`)) {
        state.deposits = state.deposits.filter(d => d.id !== deposit.id);
        saveDeposits();
        render();
      }
    });

    els.list.appendChild(node);
  });
}

function renderChart() {
  const canvas = els.chart;
  const ctx = canvas.getContext("2d");
  const cssWidth = Math.max(700, canvas.parentElement.clientWidth);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = cssWidth * ratio;
  canvas.height = 280 * ratio;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = "280px";
  ctx.scale(ratio, ratio);

  const width = cssWidth;
  const height = 280;
  const padding = { left: 72, right: 24, top: 22, bottom: 56 };
  const net = state.taxMode === "net";
  const today = dateAtMidnight(new Date());
  const points = Array.from({length:30}, (_,i) => {
    const date = addDays(today, i);
    return { date, value: totalInterestOn(date, net) };
  });
  const max = Math.max(...points.map(p => p.value), 1);
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  ctx.clearRect(0,0,width,height);
  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#667085";
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;

  for (let i=0;i<=4;i++) {
    const y = padding.top + plotH * i / 4;
    ctx.beginPath(); ctx.moveTo(padding.left,y); ctx.lineTo(width-padding.right,y); ctx.stroke();
    const value = max * (1 - i/4);
    ctx.fillText(formatYen(value), 4, y + 4);
  }

  ctx.strokeStyle = "#2f6fed";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((p,i) => {
    const x = padding.left + plotW * i / (points.length - 1);
    const y = padding.top + plotH * (1 - p.value/max);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(47,111,237,.12)";
  ctx.lineTo(width-padding.right, height-padding.bottom);
  ctx.lineTo(padding.left, height-padding.bottom);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#667085";
  [0,7,14,21,29].forEach(i => {
    const x = padding.left + plotW * i / (points.length - 1);
    ctx.fillText(formatDate(points[i].date), x - 14, height - 22);
  });

  const changes = [];
  for (let i=0;i<points.length;i++) {
    if (i===0 || Math.abs(points[i].value - points[i-1].value) > 0.5) {
      changes.push(`${formatDate(points[i].date)}：${formatYen(points[i].value)}`);
    }
  }
  document.querySelector("#dailyBreakdown").textContent =
    changes.length ? `利息が変わる日：${changes.join(" ／ ")}` : "今後30日の日次利息は一定です。";
}

function renderYieldChart() {
  const canvas = els.yieldChart;
  const ctx = canvas.getContext("2d");
  const cssWidth = Math.max(320, canvas.parentElement.clientWidth);
  const ratio = window.devicePixelRatio || 1;
  const width = cssWidth;
  const height = 260;
  const padding = { left: 66, right: 24, top: 24, bottom: 54 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const today = dateAtMidnight(new Date());
  const activeDeposits = state.deposits.filter(deposit => isActiveOn(deposit, today));
  const active = activeDeposits
    .map(deposit => ({
      deposit,
      principalYen: convertToYen(Number(deposit.principal), deposit),
      annualRate: Number(deposit.annualRate),
    }))
    .filter(item => Number.isFinite(item.principalYen) && item.principalYen > 0 && Number.isFinite(item.annualRate) && item.annualRate >= 0)
    .sort((a, b) => b.annualRate - a.annualRate);
  const invalidCount = activeDeposits.length - active.length;
  const totalPrincipal = active.reduce((sum, item) => sum + item.principalYen, 0);
  const averageYield = totalPrincipal
    ? active.reduce((sum, item) => sum + item.principalYen * item.annualRate, 0) / totalPrincipal
    : 0;
  const maxYield = Math.max(...active.map(item => item.annualRate), 1) * 1.15;
  const yFor = value => padding.top + plotH * (1 - value / maxYield);

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);
  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";

  ctx.strokeStyle = "#e2e8f0";
  ctx.fillStyle = "#667085";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const value = maxYield * (1 - i / 4);
    const y = padding.top + plotH * i / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(`${value.toFixed(value < 1 ? 2 : 1)}%`, 8, y + 4);
  }

  const principalTicks = width < 500 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  principalTicks.forEach(portion => {
    const x = padding.left + plotW * portion;
    const label = formatCompactYen(totalPrincipal * portion);
    const labelWidth = ctx.measureText(label).width;
    ctx.fillText(label, Math.min(width - padding.right - labelWidth, Math.max(padding.left, x - labelWidth / 2)), height - 20);
  });

  if (!active.length) {
    ctx.fillStyle = "#8a94a6";
    ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
    const emptyText = invalidCount
      ? "登録内容を確認してください。"
      : "運用中の定期預金がありません。";
    ctx.fillText(emptyText, padding.left + 12, padding.top + plotH / 2);
    document.querySelector("#yieldBreakdown").textContent = invalidCount
      ? `グラフに表示できない預金 ${invalidCount}件`
      : "運用元本合計 ￥0｜平均運用利回り 0.000%";
    return;
  }

  let cumulativePrincipal = 0;
  const segments = active.map(item => {
    const startX = padding.left + plotW * cumulativePrincipal / totalPrincipal;
    cumulativePrincipal += item.principalYen;
    const endX = padding.left + plotW * cumulativePrincipal / totalPrincipal;
    return { ...item, startX, endX, y: yFor(item.annualRate) };
  });

  ctx.beginPath();
  ctx.moveTo(segments[0].startX, height - padding.bottom);
  segments.forEach((segment, index) => {
    if (index === 0) ctx.lineTo(segment.startX, segment.y);
    else ctx.lineTo(segment.startX, segment.y);
    ctx.lineTo(segment.endX, segment.y);
  });
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = "rgba(47,111,237,.16)";
  ctx.fill();

  ctx.beginPath();
  segments.forEach((segment, index) => {
    if (index === 0) ctx.moveTo(segment.startX, segment.y);
    else ctx.lineTo(segment.startX, segment.y);
    ctx.lineTo(segment.endX, segment.y);
  });
  ctx.strokeStyle = "#2f6fed";
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.stroke();

  const averageY = yFor(averageYield);
  ctx.beginPath();
  ctx.moveTo(padding.left, averageY);
  ctx.lineTo(width - padding.right, averageY);
  ctx.strokeStyle = "#087443";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#087443";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(`平均 ${averageYield.toFixed(3)}%`, padding.left + 8, Math.max(padding.top + 14, averageY - 7));

  document.querySelector("#yieldBreakdown").textContent =
    `運用元本合計 ${formatYen(totalPrincipal)}｜平均運用利回り ${averageYield.toFixed(3)}%｜運用中 ${active.length}件${invalidCount ? `｜要確認 ${invalidCount}件` : ""}`;
}

function cumulativeProfitOn(date, yearStart, net = true) {
  const day = dateAtMidnight(date);
  if (day < dateAtMidnight(yearStart)) return 0;
  const interest = cumulativeInterest(yearStart, day, net);
  const fx = day >= dateAtMidnight(new Date()) ? fxGainLoss() : 0;
  return interest + fx;
}

function renderProfitChart() {
  const canvas = els.profitChart;
  const ctx = canvas.getContext("2d");
  const cssWidth = Math.max(700, canvas.parentElement.clientWidth);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = cssWidth * ratio;
  canvas.height = 280 * ratio;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = "280px";
  ctx.scale(ratio, ratio);

  const width = cssWidth;
  const height = 280;
  const padding = { left: 82, right: 24, top: 22, bottom: 56 };
  const today = dateAtMidnight(new Date());
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const totalDays = Math.max(1, diffDays(yearStart, yearEnd));
  const step = Math.max(1, Math.ceil(totalDays / 120));
  const points = [];
  for (let i=0;i<=totalDays;i+=step) {
    const date = addDays(yearStart, i);
    points.push({ date, value: cumulativeProfitOn(date, yearStart, true) });
  }
  if (!points.some(point => point.date.getTime() === today.getTime())) {
    points.push({ date: today, value: cumulativeProfitOn(today, yearStart, true) });
  }
  if (!points.some(point => point.date.getTime() === yearEnd.getTime())) {
    points.push({ date: yearEnd, value: cumulativeProfitOn(yearEnd, yearStart, true) });
  }
  points.sort((a, b) => a.date - b.date);

  const actualPoints = points.filter(point => point.date <= today);
  const forecastPoints = points.filter(point => point.date >= today);

  const values = points.map(p => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(1, max - min);
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const yFor = value => padding.top + plotH * (1 - (value - min) / range);

  ctx.clearRect(0,0,width,height);
  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#667085";
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;

  for (let i=0;i<=4;i++) {
    const value = max - range * i / 4;
    const y = yFor(value);
    ctx.beginPath(); ctx.moveTo(padding.left,y); ctx.lineTo(width-padding.right,y); ctx.stroke();
    ctx.fillText(formatYen(value), 4, y + 4);
  }

  const zeroY = yFor(0);
  ctx.strokeStyle = "#98a2b3";
  ctx.beginPath(); ctx.moveTo(padding.left, zeroY); ctx.lineTo(width-padding.right, zeroY); ctx.stroke();

  const drawLine = (linePoints, dashed = false) => {
    if (!linePoints.length) return;
    ctx.strokeStyle = "#079455";
    ctx.lineWidth = 3;
    ctx.setLineDash(dashed ? [9, 7] : []);
    ctx.beginPath();
    linePoints.forEach((p,i) => {
      const x = padding.left + plotW * diffDays(yearStart, p.date) / totalDays;
      const y = yFor(p.value);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };

  drawLine(actualPoints);

  if (actualPoints.length) {
    ctx.beginPath();
    actualPoints.forEach((p,i) => {
      const x = padding.left + plotW * diffDays(yearStart, p.date) / totalDays;
      const y = yFor(p.value);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    const actualEndX = padding.left + plotW * diffDays(yearStart, actualPoints[actualPoints.length - 1].date) / totalDays;
    ctx.lineTo(actualEndX, zeroY);
    ctx.lineTo(padding.left, zeroY);
    ctx.closePath();
    ctx.fillStyle = "rgba(7,148,85,.12)";
    ctx.fill();
  }

  drawLine(forecastPoints, true);

  const todayX = padding.left + plotW * diffDays(yearStart, today) / totalDays;
  ctx.strokeStyle = "#98a2b3";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(todayX, padding.top);
  ctx.lineTo(todayX, height - padding.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#667085";
  ctx.fillText("今日", Math.min(width - padding.right - 24, todayX + 5), padding.top + 12);

  const legendX = Math.max(padding.left, width - padding.right - 154);
  ctx.strokeStyle = "#079455";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(legendX, 12);
  ctx.lineTo(legendX + 24, 12);
  ctx.stroke();
  ctx.fillText("実績", legendX + 30, 16);
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(legendX + 70, 12);
  ctx.lineTo(legendX + 94, 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText("予測", legendX + 100, 16);

  ctx.fillStyle = "#667085";
  [yearStart, new Date(today.getFullYear(), 3, 1), new Date(today.getFullYear(), 6, 1), new Date(today.getFullYear(), 9, 1), yearEnd]
    .forEach(date => {
      const x = padding.left + plotW * diffDays(yearStart, date) / totalDays;
      ctx.fillText(formatDate(date), Math.min(width - 66, Math.max(padding.left - 14, x - 14)), height - 22);
    });

  const currentProfit = cumulativeProfitOn(today, yearStart, true);
  const yearEndProfit = cumulativeProfitOn(yearEnd, yearStart, true);
  document.querySelector("#profitBreakdown").textContent =
    `今日まで ${formatYen(currentProfit)}｜12月31日予測 ${formatYen(yearEndProfit)}（運用中は現在レート、満期済みは登録レートを使用）`;
}

function applyManualUsdRate() {
  const rate = Number(els.manualUsdRate.value);
  if (!Number.isFinite(rate) || rate <= 0) {
    alert("USDの現在レートを正しく入力してください。");
    return;
  }
  const foreign = foreignDeposits();
  if (!foreign.length) {
    alert("運用中のUSD預金が登録されていません。");
    return;
  }
  const today = dateAtMidnight(new Date());
  const now = new Date().toISOString();
  state.deposits = state.deposits.map(d => d.currency !== SUPPORTED_FOREIGN_CURRENCY || !isHeldOn(d, today) ? d : normalizeDeposit({
    ...d,
    fxRate: rate,
    fxUpdatedAt: now,
  }));
  saveDeposits();
  render();
}

function render() {
  renderSurplusFunds();
  renderSummary();
  renderDeposits();
  renderYieldChart();
  renderChart();
  renderProfitChart();
}

function openDialog(deposit = null) {
  els.form.reset();
  document.querySelector("#taxRate").value = "20.315";
  document.querySelector("#dayBasis").value = "365";
  document.querySelector("#currency").value = "JPY";
  document.querySelector("#initialFxRate").value = "1";
  document.querySelector("#fxRate").value = "1";
  document.querySelector("#interestReceiptFxRate").value = "1";
  document.querySelector("#conversionFxRate").value = "1";
  document.querySelector("#afterMaturity").value = "close";

  if (deposit) {
    els.dialogTitle.textContent = "定期預金を編集";
    document.querySelector("#depositId").value = deposit.id;
    Object.entries(deposit).forEach(([key,value]) => {
      const el = document.querySelector(`#${key}`);
      if (el) el.value = value;
    });
    if (deposit.currency !== "JPY") {
      if (Number(deposit.interestReceiptFxRate) <= 0) document.querySelector("#interestReceiptFxRate").value = "";
      if (Number(deposit.conversionFxRate) <= 0) document.querySelector("#conversionFxRate").value = "";
    }
  } else {
    els.dialogTitle.textContent = "定期預金を登録";
    document.querySelector("#depositId").value = "";
    const today = dateAtMidnight(new Date());
    document.querySelector("#startDate").value = today.toISOString().slice(0,10);
    document.querySelector("#maturityDate").value = addDays(today,30).toISOString().slice(0,10);
  }
  els.dialog.showModal();
}

els.form.addEventListener("submit", event => {
  event.preventDefault();
  const id = document.querySelector("#depositId").value || crypto.randomUUID();
  const deposit = {
    id,
    bankName: document.querySelector("#bankName").value.trim(),
    productName: document.querySelector("#productName").value.trim(),
    currency: document.querySelector("#currency").value,
    principal: Number(document.querySelector("#principal").value),
    annualRate: Number(document.querySelector("#annualRate").value),
    startDate: document.querySelector("#startDate").value,
    maturityDate: document.querySelector("#maturityDate").value,
    dayBasis: Number(document.querySelector("#dayBasis").value),
    taxRate: Number(document.querySelector("#taxRate").value),
    initialFxRate: Number(document.querySelector("#initialFxRate").value),
    fxRate: Number(document.querySelector("#fxRate").value),
    interestReceiptFxRate: Number(document.querySelector("#interestReceiptFxRate").value) || 0,
    conversionFxRate: Number(document.querySelector("#conversionFxRate").value) || 0,
    afterMaturity: document.querySelector("#afterMaturity").value,
  };

  if (dateAtMidnight(deposit.maturityDate) <= dateAtMidnight(deposit.startDate)) {
    alert("満期日は預入日より後の日付にしてください。");
    return;
  }
  if (deposit.currency === "JPY") {
    deposit.initialFxRate = 1;
    deposit.fxRate = 1;
    deposit.interestReceiptFxRate = 1;
    deposit.conversionFxRate = 1;
  }

  const index = state.deposits.findIndex(d => d.id === id);
  if (index >= 0) state.deposits[index] = normalizeDeposit({...state.deposits[index], ...deposit});
  else state.deposits.push(normalizeDeposit(deposit));

  saveDeposits();
  els.dialog.close();
  render();
});

els.add.addEventListener("click", () => openDialog());
els.close.addEventListener("click", () => els.dialog.close());
els.cancel.addEventListener("click", () => els.dialog.close());
els.taxMode.addEventListener("change", e => {
  state.taxMode = e.target.value;
  renderChart();
});
els.applyFxRate.addEventListener("click", applyManualUsdRate);
[els.surplusAmount, els.surplusAnnualRate].forEach(input => {
  input.addEventListener("input", () => {
    state.surplusFunds = {
      amount: Math.max(0, Number(els.surplusAmount.value) || 0),
      annualRate: Math.max(0, Number(els.surplusAnnualRate.value) || 0),
    };
    saveSurplusFunds();
    renderSurplusFunds();
  });
});
els.clearSurplus.addEventListener("click", () => {
  state.surplusFunds = { amount: 0, annualRate: 0 };
  localStorage.removeItem(SURPLUS_STORAGE_KEY);
  els.surplusAmount.value = "";
  els.surplusAnnualRate.value = "";
  renderSurplusFunds();
});
document.querySelector("#currency").addEventListener("change", e => {
  if (e.target.value === "JPY") {
    document.querySelector("#initialFxRate").value = "1";
    document.querySelector("#fxRate").value = "1";
    document.querySelector("#interestReceiptFxRate").value = "1";
    document.querySelector("#conversionFxRate").value = "1";
  } else {
    if (document.querySelector("#initialFxRate").value === "1") document.querySelector("#initialFxRate").value = "";
    if (document.querySelector("#fxRate").value === "1") document.querySelector("#fxRate").value = "";
    if (document.querySelector("#interestReceiptFxRate").value === "1") document.querySelector("#interestReceiptFxRate").value = "";
    if (document.querySelector("#conversionFxRate").value === "1") document.querySelector("#conversionFxRate").value = "";
  }
});

els.export.addEventListener("click", () => {
  const headers = ["id","bankName","productName","currency","principal","annualRate","startDate","maturityDate","dayBasis","taxRate","initialFxRate","fxRate","interestReceiptFxRate","conversionFxRate","afterMaturity","fxUpdatedAt"];
  const lines = [headers.join(",")].concat(state.deposits.map(d =>
    headers.map(h => `"${String(d[h] ?? "").replaceAll('"','""')}"`).join(",")
  ));
  const blob = new Blob(["\ufeff" + lines.join("\n")], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `term-deposits-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

els.importInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCSV(text.replace(/^\ufeff/,""));
  if (rows.length < 2) return alert("CSVの内容を確認してください。");
  const headers = rows[0];
  const imported = rows.slice(1).filter(r => r.some(Boolean)).map(row => {
    const obj = {};
    headers.forEach((h,i) => obj[h] = row[i]);
    obj.principal = Number(obj.principal);
    obj.annualRate = Number(obj.annualRate);
    obj.dayBasis = Number(obj.dayBasis);
    obj.taxRate = Number(obj.taxRate);
    obj.initialFxRate = Number(obj.initialFxRate || obj.fxRate || 1);
    obj.fxRate = Number(obj.fxRate);
    obj.interestReceiptFxRate = Number(obj.interestReceiptFxRate || 0);
    obj.conversionFxRate = Number(obj.conversionFxRate || 0);
    obj.id = obj.id || crypto.randomUUID();
    return normalizeDeposit(obj);
  });
  state.deposits = imported;
  saveDeposits();
  render();
  e.target.value = "";
});

function parseCSV(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i=0;i<text.length;i++) {
    const c = text[i], next = text[i+1];
    if (c === '"' && quoted && next === '"') { value += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { row.push(value); value = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && next === "\n") i++;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += c;
  }
  if (value.length || row.length) { row.push(value); rows.push(row); }
  return rows;
}

window.addEventListener("resize", () => {
  renderYieldChart();
  renderChart();
  renderProfitChart();
});

els.surplusAmount.value = state.surplusFunds.amount || "";
els.surplusAnnualRate.value = state.surplusFunds.annualRate || "";
render();
