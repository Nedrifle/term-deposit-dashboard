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

function principalFxGainLoss(deposit) {
  if (deposit.currency === "JPY") return 0;
  return convertToYen(Number(deposit.principal), deposit) - convertToInitialYen(Number(deposit.principal), deposit);
}

function dailyInterestFor(deposit, date, net = true) {
  if (!isActiveOn(deposit, date)) return 0;
  const native = net ? netDailyInterest(deposit) : grossDailyInterest(deposit);
  return convertToYen(native, deposit);
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

function remainingInterest(net = true) {
  const today = dateAtMidnight(new Date());
  return state.deposits.reduce((sum, d) => {
    const maturity = dateAtMidnight(d.maturityDate);
    if (maturity < today) return sum;
    const start = today > dateAtMidnight(d.startDate) ? today : addDays(d.startDate, 1);
    const count = Math.max(0, diffDays(start, maturity) + 1);
    const daily = convertToYen(net ? netDailyInterest(d) : grossDailyInterest(d), d);
    return sum + count * daily;
  }, 0);
}

function fxGainLoss(deposits = state.deposits, date = new Date()) {
  return deposits.reduce((sum, d) => {
    if (d.currency !== SUPPORTED_FOREIGN_CURRENCY || !isHeldOn(d, date)) return sum;
    return sum + principalFxGainLoss(d);
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
  const updatedValues = foreign.map(d => d.fxUpdatedAt).filter(Boolean).sort();
  const updatedAt = updatedValues[updatedValues.length - 1];
  const currentRates = [...new Set(foreign.map(d => Number(d.fxRate)))];
  const currentRateText = currentRates.length === 1 ? `｜現在 ${currentRates[0]}円` : currentRates.length > 1 ? "｜現在レート複数" : "";
  if (currentRates.length === 1 && document.activeElement !== els.manualUsdRate) {
    els.manualUsdRate.value = currentRates[0];
  }

  document.querySelector("#fxGainLoss").textContent = formatYen(fxTotal);
  document.querySelector("#fxRateStatus").textContent = foreign.length
    ? `運用中のUSD預金 ${foreign.length}件（元本総額 ${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(foreign.reduce((sum, d) => sum + Number(d.principal), 0))} USD）${currentRateText}${updatedAt ? `｜最終反映 ${new Date(updatedAt).toLocaleString("ja-JP")}` : ""}`
    : "運用中のUSD預金なし";
  fxCard.classList.toggle("positive", fxTotal > 0);
  fxCard.classList.toggle("negative", fxTotal < 0);
  document.querySelector("#todayInterest").textContent = formatYen(todayNet);
  document.querySelector("#todayInterestGross").textContent = `税引前 ${formatYen(todayGross)}`;
  document.querySelector("#monthInterest").textContent = formatYen(monthNet);
  document.querySelector("#monthInterestGross").textContent = `税引前 ${formatYen(monthGross)}`;
  document.querySelector("#remainingInterest").textContent = formatYen(remainingInterest(true));
  document.querySelector("#remainingInterestGross").textContent = `税引前 ${formatYen(remainingInterest(false))}`;
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
    const accruedNetYen = convertToYen(accruedNetNative, deposit);
    const status = today <= start ? "開始前" : today > maturity ? "満期済み" : "運用中";
    const remaining = today > maturity ? "満期済み" : `${Math.max(0,diffDays(today,maturity))}日`;
    const afterText = {
      close: "満期解約",
      principal: "元金継続",
      compound: "元利継続"
    }[deposit.afterMaturity];
    const rateText = deposit.currency === "JPY"
      ? ""
      : `｜預入時 ${deposit.initialFxRate}円｜現在 ${deposit.fxRate}円`;

    node.querySelector(".currency-badge").textContent = `${deposit.currency}・${status}`;
    node.querySelector(".deposit-title").textContent = deposit.productName;
    node.querySelector(".deposit-subtitle").textContent = `${deposit.bankName}｜${deposit.startDate} → ${deposit.maturityDate}`;
    node.querySelector(".principal-value").textContent = deposit.currency === "JPY"
      ? formatYen(Number(deposit.principal))
      : `${formatNative(Number(deposit.principal), deposit.currency)}（${formatYen(convertToYen(Number(deposit.principal), deposit))}）`;
    node.querySelector(".daily-value").textContent = deposit.currency === "JPY"
      ? `${formatYen(todayNetNative)} / 日`
      : `${formatNative(todayNetNative, deposit.currency)}（${formatYen(convertToYen(todayNetNative, deposit))}） / 日`;
    node.querySelector(".accrued-interest-value").textContent = formatYenPrecise(accruedNetYen);
    const fxMetric = node.querySelector(".principal-fx-metric");
    const individualFxGainLoss = principalFxGainLoss(deposit);
    fxMetric.hidden = deposit.currency === "JPY";
    fxMetric.querySelector(".principal-fx-value").textContent = formatYen(individualFxGainLoss);
    fxMetric.classList.toggle("positive", individualFxGainLoss > 0);
    fxMetric.classList.toggle("negative", individualFxGainLoss < 0);
    node.querySelector(".maturity-value").textContent = deposit.currency === "JPY"
      ? formatYen(Number(deposit.principal) + netAtMaturity)
      : `${formatNative(Number(deposit.principal) + netAtMaturity, deposit.currency)}（${formatYen(convertToYen(Number(deposit.principal) + netAtMaturity, deposit))}）`;
    node.querySelector(".remaining-days").textContent = remaining;
    node.querySelector(".progress-bar").style.width = `${progress}%`;
    node.querySelector(".deposit-note").textContent =
      `年利 ${deposit.annualRate}%｜税率 ${deposit.taxRate}%${rateText}｜${afterText}`;

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
  const totalDays = Math.max(1, diffDays(yearStart, today));
  const step = Math.max(1, Math.ceil(totalDays / 120));
  const points = [];
  for (let i=0;i<=totalDays;i+=step) {
    const date = addDays(yearStart, i);
    points.push({ date, value: cumulativeProfitOn(date, yearStart, true) });
  }
  if (points[points.length - 1].date < today) {
    points.push({ date: today, value: cumulativeProfitOn(today, yearStart, true) });
  }

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

  ctx.strokeStyle = "#079455";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((p,i) => {
    const x = padding.left + plotW * diffDays(yearStart, p.date) / totalDays;
    const y = yFor(p.value);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(7,148,85,.12)";
  ctx.lineTo(width-padding.right, zeroY);
  ctx.lineTo(padding.left, zeroY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#667085";
  [yearStart, new Date(today.getFullYear(), 3, 1), new Date(today.getFullYear(), 6, 1), new Date(today.getFullYear(), 9, 1), today]
    .filter((date, index, arr) => date <= today && arr.findIndex(d => d.getTime() === date.getTime()) === index)
    .forEach(date => {
      const x = padding.left + plotW * diffDays(yearStart, date) / totalDays;
      ctx.fillText(formatDate(date), Math.min(width - 66, Math.max(padding.left - 14, x - 14)), height - 22);
    });

  document.querySelector("#profitBreakdown").textContent =
    `1月1日から今日まで：利息 ${formatYen(cumulativeInterest(yearStart, today, true))} ＋ 為替差損益 ${formatYen(fxGainLoss())} ＝ ${formatYen(cumulativeProfitOn(today, yearStart, true))}`;
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
  document.querySelector("#afterMaturity").value = "close";

  if (deposit) {
    els.dialogTitle.textContent = "定期預金を編集";
    document.querySelector("#depositId").value = deposit.id;
    Object.entries(deposit).forEach(([key,value]) => {
      const el = document.querySelector(`#${key}`);
      if (el) el.value = value;
    });
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
    afterMaturity: document.querySelector("#afterMaturity").value,
  };

  if (dateAtMidnight(deposit.maturityDate) <= dateAtMidnight(deposit.startDate)) {
    alert("満期日は預入日より後の日付にしてください。");
    return;
  }
  if (deposit.currency === "JPY") {
    deposit.initialFxRate = 1;
    deposit.fxRate = 1;
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
  }
});

els.export.addEventListener("click", () => {
  const headers = ["id","bankName","productName","currency","principal","annualRate","startDate","maturityDate","dayBasis","taxRate","initialFxRate","fxRate","afterMaturity","fxUpdatedAt"];
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
  renderChart();
  renderProfitChart();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

els.surplusAmount.value = state.surplusFunds.amount || "";
els.surplusAnnualRate.value = state.surplusFunds.annualRate || "";
render();
