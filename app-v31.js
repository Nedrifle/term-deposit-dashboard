const STORAGE_KEY = "term-deposit-dashboard-v1";
const SURPLUS_STORAGE_KEY = "term-deposit-surplus-v1";
const FX_HEDGE_STORAGE_KEY = "term-deposit-fx-hedge-v1";
const OWNERS_STORAGE_KEY = "term-deposit-owners-v1";
const OWNER_SETTINGS_KEY = "term-deposit-owner-settings-v1";
const FX_LEDGER_STORAGE_KEY = "term-deposit-fx-ledger-v1";
const DEFAULT_OWNER_ID = "self";
let owners = loadOwners();
let selectedOwnerId = localStorage.getItem("term-deposit-selected-owner-v1") || "all";
if (selectedOwnerId !== "all" && !owners.some(owner => owner.id === selectedOwnerId)) selectedOwnerId = "all";
let ownerSettings = loadOwnerSettings();
let fxLedger = loadFxLedger();
let fxYear = Math.max(2026, new Date().getFullYear());
const SURPLUS_TAX_RATE = 20.315;
const SUPPORTED_FOREIGN_CURRENCY = "USD";
const PROFIT_SERIES = [
  { key: "interest", label: "税引後利息", color: "#2f6fed" },
  { key: "depositRealized", label: "預金・確定為替損益", color: "#079455" },
  { key: "depositUnrealized", label: "預金・評価損益", color: "#8750c7" },
  { key: "fxRealized", label: "FX・実現損益", color: "#d97706" },
  { key: "fxUnrealized", label: "FX・未実現損益", color: "#d34272" },
];
let profitYear = Number(localStorage.getItem("term-deposit-profit-year-v1")) || new Date().getFullYear();
if (!Number.isInteger(profitYear) || profitYear < 1000 || profitYear > 9999) profitYear = new Date().getFullYear();
let profitChartModel = null;
const PROFIT_SELECTION_KEY = "term-deposit-profit-selection-v1";
let selectedProfitKeys = loadProfitSelection();
const APP_VIEWS = new Set(["dashboard", "active", "matured", "fx-details", "fx"]);
let currentView = viewFromHash();
const state = {
  deposits: loadDeposits(),
  surplusFunds: scopedSettings("surplusFunds"),
  fxHedge: scopedSettings("fxHedge"),
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
  fxCalculationDetails: document.querySelector("#fxCalculationDetails"),
  taxMode: document.querySelector("#taxMode"),
  manualUsdRate: document.querySelector("#manualUsdRate"),
  applyFxRate: document.querySelector("#applyFxRateButton"),
  fxSettledProfit: document.querySelector("#fxSettledProfit"),
  fxUnsettledProfit: document.querySelector("#fxUnsettledProfit"),
  surplusAmount: document.querySelector("#surplusAmount"),
  surplusAnnualRate: document.querySelector("#surplusAnnualRate"),
  surplusDailyInterest: document.querySelector("#surplusDailyInterest"),
  surplusDailyInterestNet: document.querySelector("#surplusDailyInterestNet"),
  clearSurplus: document.querySelector("#clearSurplusButton"),
  export: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  dashboardView: document.querySelector("#dashboardView"),
  depositsView: document.querySelector("#depositsView"),
  fxDetailsView: document.querySelector("#fxDetailsView"),
  depositViewTitle: document.querySelector("#depositViewTitle"),
  activeNavCount: document.querySelector("#activeNavCount"),
  maturedNavCount: document.querySelector("#maturedNavCount"),
  viewLinks: [...document.querySelectorAll("[data-view-link]")],
};

function loadFxLedger() {
  try {
    const saved = JSON.parse(localStorage.getItem(FX_LEDGER_STORAGE_KEY));
    if (saved?.version === 1 && Array.isArray(saved.companies) && saved.byOwner && typeof saved.byOwner === "object") return saved;
  } catch (e) {}
  const byOwner = {};
  owners.forEach(owner => {
    const previous = ownerSettings[owner.id]?.fxHedge;
    byOwner[owner.id] = {
      realized: {},
      legacyRealized: Number(previous?.settledProfit) || 0,
      unrealized: Number(previous?.unsettledProfit) || 0,
      updatedAt: "",
    };
  });
  return { version: 1, companies: [], byOwner };
}

function fxOwnerData(ownerId, create = false) {
  if (create && !fxLedger.byOwner[ownerId]) {
    fxLedger.byOwner[ownerId] = { realized: {}, legacyRealized: 0, unrealized: 0, updatedAt: "" };
  }
  return fxLedger.byOwner[ownerId] || { realized: {}, legacyRealized: 0, unrealized: 0, updatedAt: "" };
}

function fxScopeOwners() {
  return selectedOwnerId === "all" ? owners : owners.filter(owner => owner.id === selectedOwnerId);
}

function fxCellValue(month, companyId) {
  return fxScopeOwners().reduce((sum, owner) => sum + (Number(fxOwnerData(owner.id).realized[month]?.[companyId]) || 0), 0);
}

function fxLegacyTotal() {
  return fxScopeOwners().reduce((sum, owner) => sum + (Number(fxOwnerData(owner.id).legacyRealized) || 0), 0);
}

function fxLedgerSummary() {
  return fxScopeOwners().reduce((total, owner) => {
    const data = fxOwnerData(owner.id);
    total.settledProfit += Number(data.legacyRealized) || 0;
    Object.entries(data.realized).forEach(([month, values]) => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2026) return;
      total.settledProfit += Object.values(values).reduce((sum, value) => sum + (Number(value) || 0), 0);
    });
    total.unsettledProfit += Number(data.unrealized) || 0;
    return total;
  }, { settledProfit: 0, unsettledProfit: 0 });
}

function saveFxLedger() {
  localStorage.setItem(FX_LEDGER_STORAGE_KEY, JSON.stringify(fxLedger));
}

function parseFxAmount(value) {
  const normalized = value.normalize("NFKC").replace(/[−–]/g, "-").replace(/,/g, "").trim();
  if (!normalized) return 0;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function storeFxCell(month, companyId, value) {
  if (selectedOwnerId === "all" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2026 || !fxLedger.companies.some(company => company.id === companyId) || !Number.isFinite(value)) return false;
  const data = fxOwnerData(selectedOwnerId, true);
  if (!data.realized[month]) data.realized[month] = {};
  data.realized[month][companyId] = value;
  saveFxLedger();
  return true;
}

function refreshFxTotals() {
  let yearTotal = 0;
  for (let month = 1; month <= 12; month++) {
    const key = `${fxYear}-${String(month).padStart(2, "0")}`;
    const total = fxLedger.companies.reduce((sum, company) => sum + fxCellValue(key, company.id), 0);
    yearTotal += total;
    document.querySelector(`#fxMonthTotal-${month}`).textContent = formatYen(total);
  }
  fxLedger.companies.forEach((company, index) => {
    let total = 0;
    for (let month = 1; month <= 12; month++) total += fxCellValue(`${fxYear}-${String(month).padStart(2, "0")}`, company.id);
    document.querySelector(`#fxCompanyTotal-${index}`).textContent = formatYen(total);
  });
  document.querySelector("#fxYearTotal").textContent = formatYen(yearTotal);
  const summary = fxLedgerSummary();
  document.querySelector("#fxRegisteredRealized").textContent = formatYen(summary.settledProfit);
  document.querySelector("#fxCurrentUnrealized").textContent = formatYen(summary.unsettledProfit);
  document.querySelector("#fxRegisteredTotal").textContent = formatYen(summary.settledProfit + summary.unsettledProfit);
}

function updateFxOverview() {
  state.fxHedge = fxLedgerSummary();
  refreshFxTotals();
  renderSummary();
  renderProfitChart();
}

function setFxSaveStatus(message, error = false) {
  const status = document.querySelector("#fxSaveStatus");
  status.textContent = message;
  status.classList.toggle("negative", error);
}

function handleFxAmountInput(input, saveValue) {
  const amount = parseFxAmount(input.value);
  input.setAttribute("aria-invalid", amount === null ? "true" : "false");
  if (amount === null) {
    setFxSaveStatus("数値を入力してください。入力途中・不正な値は保存されません。", true);
    return;
  }
  saveValue(amount);
  updateFxOverview();
  setFxSaveStatus("保存しました（この端末内に自動保存）");
}

function renderFxLedger() {
  const aggregate = selectedOwnerId === "all";
  const yearSelect = document.querySelector("#fxYear");
  const storedYears = Object.values(fxLedger.byOwner).flatMap(data => Object.keys(data.realized).map(key => Number(key.slice(0, 4)))).filter(year => Number.isInteger(year) && year >= 2026 && year <= 9999);
  const maxYear = Math.max(2026, new Date().getFullYear(), fxYear, ...storedYears);
  yearSelect.replaceChildren(...Array.from({ length: maxYear - 2026 + 2 }, (_, index) => new Option(`${2026 + index}年`, String(2026 + index))));
  yearSelect.value = String(fxYear);
  document.querySelector("#fxEditingScope").textContent = aggregate ? "全員合算は閲覧用です。保有者を選択すると入力できます。" : `${ownerName(selectedOwnerId)}さんの損益を入力できます。入力内容は自動保存されます。`;
  document.querySelector("#addFxCompanyButton").disabled = aggregate;
  document.querySelector("#fxCompanyEmpty").hidden = fxLedger.companies.length > 0;
  const head = document.querySelector("#fxLedgerHead");
  const body = document.querySelector("#fxLedgerBody");
  const foot = document.querySelector("#fxLedgerFoot");
  head.replaceChildren(); body.replaceChildren(); foot.replaceChildren();
  const header = document.createElement("tr");
  const monthHeading = document.createElement("th"); monthHeading.scope = "col"; monthHeading.textContent = "年月"; header.appendChild(monthHeading);
  fxLedger.companies.forEach(company => {
    const th = document.createElement("th"); th.scope = "col";
    const name = document.createElement("span"); name.textContent = company.name; th.appendChild(name);
    if (!aggregate) {
      const actions = document.createElement("div"); actions.className = "fx-company-actions";
      const rename = document.createElement("button"); rename.type = "button"; rename.textContent = "名前変更"; rename.className = "secondary-button";
      rename.setAttribute("aria-label", `${company.name}の名前を変更`);
      rename.addEventListener("click", () => renameFxCompany(company));
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "削除"; remove.className = "danger-button";
      remove.setAttribute("aria-label", `${company.name}を削除`);
      remove.addEventListener("click", () => removeFxCompany(company));
      actions.append(rename, remove); th.appendChild(actions);
    }
    header.appendChild(th);
  });
  const totalHeading = document.createElement("th"); totalHeading.scope = "col"; totalHeading.textContent = "月合計"; header.appendChild(totalHeading); head.appendChild(header);
  for (let month = 1; month <= 12; month++) {
    const key = `${fxYear}-${String(month).padStart(2, "0")}`;
    const row = document.createElement("tr");
    const label = document.createElement("th"); label.scope = "row"; label.textContent = `${fxYear}年${month}月`; row.appendChild(label);
    fxLedger.companies.forEach(company => {
      const td = document.createElement("td");
      if (aggregate) {
        td.textContent = formatYen(fxCellValue(key, company.id));
      } else {
        const input = document.createElement("input"); input.type = "text"; input.inputMode = "text"; input.spellcheck = false; input.autocapitalize = "off";
        input.value = fxOwnerData(selectedOwnerId).realized[key]?.[company.id] ?? "";
        input.placeholder = "0";
        input.setAttribute("aria-label", `${fxYear}年${month}月 ${company.name}の実現損益（円）`);
        input.addEventListener("input", () => handleFxAmountInput(input, value => storeFxCell(key, company.id, value)));
        td.appendChild(input);
      }
      row.appendChild(td);
    });
    const total = document.createElement("td"); total.id = `fxMonthTotal-${month}`; row.appendChild(total); body.appendChild(row);
  }
  const footer = document.createElement("tr");
  const label = document.createElement("th"); label.scope = "row"; label.textContent = "年合計"; footer.appendChild(label);
  fxLedger.companies.forEach((company, index) => { const td = document.createElement("td"); td.id = `fxCompanyTotal-${index}`; footer.appendChild(td); });
  const total = document.createElement("td"); total.id = "fxYearTotal"; footer.appendChild(total); foot.appendChild(footer);
  els.fxSettledProfit.value = fxLegacyTotal() || "";
  els.fxUnsettledProfit.value = fxLedgerSummary().unsettledProfit || "";
  document.querySelector("#fxLegacyPanel").hidden = fxLegacyTotal() === 0;
  const updates = fxScopeOwners().map(owner => fxOwnerData(owner.id).updatedAt).filter(Boolean).sort();
  document.querySelector("#fxUnrealizedUpdatedAt").textContent = updates.length ? `最終更新：${new Date(updates[updates.length - 1]).toLocaleString("ja-JP")}` : "現在の損益を上書き入力してください。月ごとの累積ではありません。";
  setFxSaveStatus(aggregate ? "全員合算を表示中" : "入力内容はこの端末内に自動保存されます。");
  refreshFxTotals();
}

function addFxCompany() {
  if (selectedOwnerId === "all") return;
  const name = prompt("FX会社名を入力してください（会社一覧は全保有者で共通です）。")?.trim();
  if (!name) return;
  if (fxLedger.companies.some(company => company.name === name)) return alert("同じFX会社名が登録されています。");
  fxLedger.companies.push({ id: crypto.randomUUID(), name });
  saveFxLedger(); renderFxLedger();
}

function renameFxCompany(company) {
  if (selectedOwnerId === "all") return;
  const name = prompt("FX会社名を変更します（全保有者に反映されます）。", company.name)?.trim();
  if (!name) return;
  if (fxLedger.companies.some(other => other.id !== company.id && other.name === name)) return alert("同じFX会社名が登録されています。");
  company.name = name; saveFxLedger(); renderFxLedger();
}

function removeFxCompany(company) {
  if (selectedOwnerId === "all") return;
  const hasValues = Object.values(fxLedger.byOwner).some(data => Object.values(data.realized).some(values => Number(values[company.id]) !== 0 && values[company.id] != null));
  if (hasValues) return alert("損益が登録されている会社は削除できません。全保有者・全登録年の該当金額を消去してから削除してください。");
  if (!confirm(`${company.name}を会社一覧から削除しますか？`)) return;
  Object.values(fxLedger.byOwner).forEach(data => Object.values(data.realized).forEach(values => delete values[company.id]));
  fxLedger.companies = fxLedger.companies.filter(other => other.id !== company.id);
  saveFxLedger(); renderFxLedger();
}

function loadOwners() {
  try {
    const saved = JSON.parse(localStorage.getItem(OWNERS_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length && saved.every(o => o.id && typeof o.name === "string") && new Set(saved.map(o => o.id)).size === saved.length) {
      if (!saved.some(o => o.id === DEFAULT_OWNER_ID)) saved.unshift({ id: DEFAULT_OWNER_ID, name: "本人" });
      return saved;
    }
  } catch (e) {}
  return [{ id: DEFAULT_OWNER_ID, name: "本人" }];
}

function loadOwnerSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(OWNER_SETTINGS_KEY));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
  } catch (e) {}
  return { [DEFAULT_OWNER_ID]: { surplusFunds: loadSurplusFunds(), fxHedge: loadFxHedge() } };
}

function scopedSettings(key) {
  if (key === "fxHedge") return fxLedgerSummary();
  const empty = key === "surplusFunds" ? { amount: 0, annualRate: 0 } : { settledProfit: 0, unsettledProfit: 0 };
  if (selectedOwnerId !== "all") return { ...empty, ...ownerSettings[selectedOwnerId]?.[key] };
  const values = owners.map(o => ({ ...empty, ...ownerSettings[o.id]?.[key] }));
  const amount = values.reduce((sum, value) => sum + value.amount, 0);
  return { amount, annualRate: amount ? values.reduce((sum, value) => sum + value.amount * value.annualRate, 0) / amount : 0 };
}

function visibleDeposits() {
  return state.deposits.filter(d => selectedOwnerId === "all" || d.ownerId === selectedOwnerId);
}

function ownerName(id) { return owners.find(o => o.id === id)?.name || "本人"; }

function saveScopedSettings(key, value) {
  if (selectedOwnerId === "all") return;
  ownerSettings[selectedOwnerId] = { ...ownerSettings[selectedOwnerId], [key]: { ...value } };
  localStorage.setItem(OWNER_SETTINGS_KEY, JSON.stringify(ownerSettings));
}

function renderOwnerControls() {
  const selector = document.querySelector("#ownerSelector");
  const formSelector = document.querySelector("#ownerId");
  const previous = formSelector.value;
  selector.replaceChildren(new Option("全員合算", "all"), ...owners.map(o => new Option(o.name, o.id)));
  selector.value = selectedOwnerId;
  formSelector.replaceChildren(...owners.map(o => new Option(o.name, o.id)));
  formSelector.value = owners.some(o => o.id === previous) ? previous : DEFAULT_OWNER_ID;
  document.querySelector("#ownerScopeLabel").textContent = selectedOwnerId === "all" ? "全員の預金を合算して表示しています。余剰資金は概要、FX損益はFXタブで保有者ごとに入力できます。" : `${ownerName(selectedOwnerId)}さんの預金を表示しています。`;
  document.querySelector("#renameOwnerButton").disabled = selectedOwnerId === "all";
  [els.surplusAmount, els.surplusAnnualRate, els.clearSurplus, els.fxSettledProfit, els.fxUnsettledProfit].forEach(el => el.disabled = selectedOwnerId === "all");
}

function syncScopedInputs() {
  state.surplusFunds = scopedSettings("surplusFunds");
  state.fxHedge = scopedSettings("fxHedge");
  els.surplusAmount.value = state.surplusFunds.amount || "";
  els.surplusAnnualRate.value = state.surplusFunds.annualRate || "";
  els.fxSettledProfit.value = fxLegacyTotal() || "";
  els.fxUnsettledProfit.value = state.fxHedge.unsettledProfit || "";
  els.manualUsdRate.value = "";
}

function viewFromHash() {
  const view = window.location.hash.slice(1);
  return APP_VIEWS.has(view) ? view : "dashboard";
}

function applyView() {
  currentView = viewFromHash();
  els.dashboardView.hidden = currentView !== "dashboard";
  els.depositsView.hidden = currentView !== "active" && currentView !== "matured";
  els.fxDetailsView.hidden = currentView !== "fx-details";
  document.querySelector("#fxView").hidden = currentView !== "fx";
  if (currentView === "fx") renderFxLedger();

  els.viewLinks.forEach(link => {
    if (link.dataset.viewLink === currentView) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (currentView === "active" || currentView === "matured") renderDeposits();
  if (currentView === "dashboard") {
    requestAnimationFrame(() => {
      renderYieldChart();
      renderChart();
      renderProfitChart();
    });
  }
}

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
  saveScopedSettings("surplusFunds", state.surplusFunds);
}

function loadFxHedge() {
  try {
    const saved = JSON.parse(localStorage.getItem(FX_HEDGE_STORAGE_KEY));
    return {
      settledProfit: Number(saved?.settledProfit) || 0,
      unsettledProfit: Number(saved?.unsettledProfit) || 0,
    };
  } catch (e) {
    return { settledProfit: 0, unsettledProfit: 0 };
  }
}

function normalizeDeposit(deposit) {
  const currency = deposit.currency || "JPY";
  const fxRate = currency === "JPY" ? 1 : Number(deposit.fxRate || deposit.initialFxRate || 1);
  return {
    ...deposit,
    id: deposit.id || crypto.randomUUID(),
    ownerId: owners.some(o => o.id === deposit.ownerId) ? deposit.ownerId : DEFAULT_OWNER_ID,
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
  return d >= dateAtMidnight(deposit.startDate) && d < dateAtMidnight(deposit.maturityDate);
}

function isHeldOn(deposit, date) {
  const d = dateAtMidnight(date);
  return d >= dateAtMidnight(deposit.startDate) && d < dateAtMidnight(deposit.maturityDate);
}

function isMaturedOn(deposit, date = new Date()) {
  return dateAtMidnight(date) >= dateAtMidnight(deposit.maturityDate);
}

function grossDailyInterest(deposit) {
  return Number(deposit.principal) * (Number(deposit.annualRate) / 100) / Number(deposit.dayBasis);
}

function accruedInterestDays(deposit, date = new Date()) {
  const start = dateAtMidnight(deposit.startDate);
  // Include today's interest, capped at the day before maturity.
  const end = new Date(Math.min(addDays(date, 1), dateAtMidnight(deposit.maturityDate)));
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

function interestConversionRate(deposit) {
  if (deposit.currency === "JPY") return 1;
  // Keep interest on the deposit-date basis, including after maturity.
  // Any difference at yen conversion is accounted for as realized FX profit.
  return Number(deposit.initialFxRate || deposit.fxRate || 1);
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
  const conversionRate = Number(deposit.conversionFxRate);
  if (conversionRate <= 0) return 0;
  return maturityNetInterest(deposit) * (conversionRate - interestConversionRate(deposit));
}

function dailyInterestFor(deposit, date, net = true) {
  if (!isActiveOn(deposit, date)) return 0;
  const native = net ? netDailyInterest(deposit) : grossDailyInterest(deposit);
  return native * interestConversionRate(deposit);
}

function totalInterestOn(date, net = true) {
  return visibleDeposits().reduce((sum, d) => sum + dailyInterestFor(d, date, net), 0);
}

function cumulativeInterest(from, to, net = true) {
  let total = 0;
  for (let d = dateAtMidnight(from); d <= dateAtMidnight(to); d = addDays(d, 1)) {
    total += totalInterestOn(d, net);
  }
  return total;
}

function depositFxBreakdown(deposits = visibleDeposits(), date = new Date()) {
  return deposits.reduce((result, deposit) => {
    if (deposit.currency !== SUPPORTED_FOREIGN_CURRENCY) return result;
    if (isMaturedOn(deposit, date)) {
      result.realized += principalFxGainLoss(deposit, date) + interestFxGainLoss(deposit, date);
    } else if (isHeldOn(deposit, date)) {
      result.unrealized += principalFxGainLoss(deposit, date);
    }
    return result;
  }, { realized: 0, unrealized: 0 });
}

function fxGainLoss(deposits = visibleDeposits(), date = new Date()) {
  const breakdown = depositFxBreakdown(deposits, date);
  return breakdown.realized + breakdown.unrealized;
}

function fxHedgeGainLoss() {
  const summary = fxLedgerSummary();
  return summary.settledProfit + summary.unsettledProfit;
}

function totalCurrencyGainLoss() {
  return fxGainLoss() + fxHedgeGainLoss();
}

function foreignDeposits(date = new Date()) {
  return visibleDeposits().filter(d => d.currency === SUPPORTED_FOREIGN_CURRENCY && isHeldOn(d, date));
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
  const active = visibleDeposits().filter(d => isActiveOn(d, today));
  const principalYen = active.reduce((sum, d) => sum + convertToYen(Number(d.principal), d), 0);
  const breakdown = depositFxBreakdown();
  const fxSummary = fxLedgerSummary();
  const settledHedge = fxSummary.settledProfit;
  const unsettledHedge = fxSummary.unsettledProfit;
  const realizedTotal = breakdown.realized + settledHedge;
  const unrealizedTotal = breakdown.unrealized + unsettledHedge;
  const fxTotal = realizedTotal + unrealizedTotal;
  const foreign = foreignDeposits();
  const maturedForeign = visibleDeposits().filter(d => d.currency === SUPPORTED_FOREIGN_CURRENCY && isMaturedOn(d, today));
  const settledForeign = maturedForeign.filter(d => Number(d.conversionFxRate) > 0);
  const pendingForeign = maturedForeign.length - settledForeign.length;
  const foreignPrincipal = foreign.reduce((sum, d) => sum + Number(d.principal), 0);
  const averageInitialFxRate = foreignPrincipal > 0
    ? foreign.reduce((sum, d) => sum + Number(d.principal) * Number(d.initialFxRate), 0) / foreignPrincipal
    : 0;
  const averageInitialFxRateText = new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(averageInitialFxRate);
  const currentRates = [...new Set(foreign.map(d => Number(d.fxRate)))];
  const currentRateText = currentRates.length === 1 ? `｜現在 ${currentRates[0]}円` : currentRates.length > 1 ? "｜現在レート複数" : "";
  if (currentRates.length === 1 && document.activeElement !== els.manualUsdRate) {
    els.manualUsdRate.value = currentRates[0];
  }

  const setProfitValue = (element, value) => {
    element.textContent = formatYen(value);
    element.classList.toggle("positive", value > 0);
    element.classList.toggle("negative", value < 0);
  };
  setProfitValue(document.querySelector("#realizedDepositFx"), breakdown.realized);
  setProfitValue(document.querySelector("#settledHedgeFx"), settledHedge);
  setProfitValue(document.querySelector("#unrealizedDepositFx"), breakdown.unrealized);
  setProfitValue(document.querySelector("#unsettledHedgeFx"), unsettledHedge);
  setProfitValue(document.querySelector("#fxGainLoss"), fxTotal);
  const activeStatus = foreign.length
    ? `運用中 ${foreign.length}件（元本 ${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(foreignPrincipal)} USD）｜平均預入レート ${averageInitialFxRateText}円${currentRateText}`
    : "運用中なし";
  const maturedStatus = maturedForeign.length
    ? `｜満期済み算定 ${settledForeign.length}件${pendingForeign ? `・要入力 ${pendingForeign}件` : ""}`
    : "";
  document.querySelector("#fxRateStatus").textContent = `${activeStatus}${maturedStatus}`;
  document.querySelector("#todayInterest").textContent = formatYen(todayNet);
  document.querySelector("#todayInterestGross").textContent = `税引前 ${formatYen(todayGross)}`;
  document.querySelector("#monthInterest").textContent = formatYen(monthNet);
  document.querySelector("#monthInterestGross").textContent = `税引前 ${formatYen(monthGross)}`;
  document.querySelector("#activeDepositCount").textContent = `${active.length}件`;
  document.querySelector("#totalPrincipal").textContent = `元本合計 ${formatYen(principalYen)}`;
  els.activeNavCount.textContent = visibleDeposits().filter(d => !isMaturedOn(d, today)).length;
  els.maturedNavCount.textContent = visibleDeposits().filter(d => isMaturedOn(d, today)).length;
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
  const showingMatured = currentView === "matured";
  const sorted = visibleDeposits()
    .filter(deposit => showingMatured ? isMaturedOn(deposit, today) : !isMaturedOn(deposit, today))
    .sort((a,b) => {
      const difference = dateAtMidnight(a.maturityDate) - dateAtMidnight(b.maturityDate);
      return showingMatured ? -difference : difference;
    });
  els.depositViewTitle.textContent = showingMatured ? "満期済みの定期預金" : "運用中の定期預金";
  els.empty.textContent = showingMatured
    ? "満期済みの定期預金はありません。"
    : "運用中の定期預金はありません。";
  els.empty.hidden = sorted.length > 0;

  sorted.forEach(deposit => {
    const node = els.template.content.cloneNode(true);
    const start = dateAtMidnight(deposit.startDate);
    const maturity = dateAtMidnight(deposit.maturityDate);
    const totalDays = Math.max(1, diffDays(start, maturity));
    const elapsed = Math.min(totalDays, Math.max(0, diffDays(start, today)));
    const progress = Math.round((elapsed / totalDays) * 100);
    const interestDays = Math.max(0, diffDays(start, maturity));
    const netAtMaturity = netDailyInterest(deposit) * interestDays;
    const todayNetNative = isActiveOn(deposit, today) ? netDailyInterest(deposit) : 0;
    const accruedNetNative = accruedNetInterest(deposit, today);
    const matured = isMaturedOn(deposit, today);
    const interestRate = interestConversionRate(deposit);
    const principalRate = principalValuationRate(deposit, today);
    const accruedNetYen = accruedNetNative * interestRate;
    const status = today < start ? "開始前" : matured ? "満期済み" : "運用中";
    const remaining = matured ? "満期済み" : `${Math.max(0,diffDays(today,maturity))}日`;
    const rateText = deposit.currency === "JPY"
      ? ""
      : matured
        ? `｜預入時 ${deposit.initialFxRate}円｜円転時 ${Number(deposit.conversionFxRate) > 0 ? `${deposit.conversionFxRate}円` : "未入力"}`
        : `｜預入時 ${deposit.initialFxRate}円｜現在 ${deposit.fxRate}円`;

    node.querySelector(".currency-badge").textContent = `${deposit.currency}・${status}`;
    node.querySelector(".deposit-title").textContent = deposit.productName;
    node.querySelector(".deposit-subtitle").textContent = `${ownerName(deposit.ownerId)}｜${deposit.bankName}｜${deposit.startDate} → ${deposit.maturityDate}`;
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
    interestFxMetric.querySelector(".interest-fx-value").textContent = Number(deposit.conversionFxRate) <= 0
      ? "円転時レート未入力"
      : formatYen(individualInterestFxGainLoss);
    interestFxMetric.classList.toggle("positive", individualInterestFxGainLoss > 0);
    interestFxMetric.classList.toggle("negative", individualInterestFxGainLoss < 0);
    node.querySelector(".maturity-interest-value").textContent = deposit.currency === "JPY"
      ? formatYen(netAtMaturity)
      : `${formatNative(netAtMaturity, deposit.currency)}（${formatYen(netAtMaturity * interestRate)}）`;
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

function renderFxCalculationDetails() {
  els.fxCalculationDetails.innerHTML = "";
  const today = dateAtMidnight(new Date());
  const foreign = visibleDeposits()
    .filter(deposit => deposit.currency === SUPPORTED_FOREIGN_CURRENCY)
    .sort((a, b) => dateAtMidnight(a.maturityDate) - dateAtMidnight(b.maturityDate));

  if (!foreign.length) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "USD預金の為替差損益明細はありません。";
    els.fxCalculationDetails.appendChild(empty);
    return;
  }

  const amountText = value => new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value);
  const rateText = value => new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 6 }).format(value);

  foreign.forEach(deposit => {
    const matured = isMaturedOn(deposit, today);
    const started = today >= dateAtMidnight(deposit.startDate);
    const status = matured ? "満期済み" : started ? "運用中" : "開始前";
    const principal = Number(deposit.principal);
    const initialRate = Number(deposit.initialFxRate);
    const appliedPrincipalRate = matured ? Number(deposit.conversionFxRate) : Number(deposit.fxRate);
    const principalReady = started && (!matured || appliedPrincipalRate > 0);
    const principalGain = principalReady ? principalFxGainLoss(deposit, today) : 0;
    const netInterest = maturityNetInterest(deposit);
    const conversionRate = Number(deposit.conversionFxRate);
    const interestReady = matured && conversionRate > 0;
    const interestGain = interestReady ? interestFxGainLoss(deposit, today) : 0;

    const row = document.createElement("article");
    row.className = "fx-calculation-row";

    const heading = document.createElement("div");
    heading.className = "fx-calculation-title";
    const title = document.createElement("strong");
    title.textContent = deposit.productName;
    const badge = document.createElement("span");
    badge.textContent = `USD・${status}`;
    heading.append(title, badge);

    const period = document.createElement("p");
    period.className = "fx-calculation-period";
    const duration = Math.max(0, diffDays(deposit.startDate, deposit.maturityDate));
    period.textContent = `運用期間：${deposit.startDate} → ${deposit.maturityDate}（${duration}日間）`;

    const principalDetail = document.createElement("p");
    principalDetail.textContent = !started
      ? "元本：預入開始後に算定します。"
      : principalReady
        ? `元本：${amountText(principal)} USD ×（${rateText(appliedPrincipalRate)}円［${matured ? "円転時" : "現在"}］− ${rateText(initialRate)}円［預入時］）＝ ${formatYen(principalGain)}`
        : "元本：円転時為替レートを入力してください。";

    const interestDetail = document.createElement("p");
    if (!matured) {
      interestDetail.textContent = "税引後利息：預入時レートで円換算し、満期後の円転時に預入時レートとの差額を確定為替差損益に計上します。";
    } else if (!interestReady) {
      interestDetail.textContent = "税引後利息：円転時為替レートを入力してください（預入時レートとの差額を算定します）。";
    } else {
      interestDetail.textContent = `税引後利息：${amountText(netInterest)} USD ×（${rateText(conversionRate)}円［円転時］− ${rateText(initialRate)}円［預入時］）＝ ${formatYen(interestGain)}`;
    }

    const total = document.createElement("p");
    total.className = "fx-calculation-total";
    const totalLabel = !matured
      ? "現在の為替差損益"
      : principalReady && interestReady
        ? "この預金の為替差損益"
        : "為替差損益（入力済み分）";
    total.textContent = `${totalLabel}：${formatYen(principalGain + interestGain)}`;
    row.append(heading, period, principalDetail, interestDetail, total);
    els.fxCalculationDetails.appendChild(row);
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
  const activeDeposits = visibleDeposits().filter(deposit => isActiveOn(deposit, today));
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

function loadProfitSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFIT_SELECTION_KEY));
    if (Array.isArray(saved)) return new Set(saved.filter(key => PROFIT_SERIES.some(series => series.key === key)));
  } catch (e) {}
  return new Set(PROFIT_SERIES.map(series => series.key));
}

function selectedProfitSeries() {
  return PROFIT_SERIES.filter(series => selectedProfitKeys.has(series.key));
}

function filterProfitPoint(point, keys = selectedProfitKeys) {
  const values = Object.fromEntries(PROFIT_SERIES.filter(series => keys.has(series.key)).map(series => [series.key, point.values[series.key] || 0]));
  return { date: point.date, values, value: Object.values(values).reduce((sum, value) => sum + value, 0) };
}

function renderProfitSeriesControls() {
  document.querySelectorAll("[data-profit-series]").forEach(input => {
    input.checked = selectedProfitKeys.has(input.dataset.profitSeries);
    input.closest("label").classList.toggle("selected", input.checked);
  });
  document.querySelector("#profitSeriesStatus").textContent = selectedProfitKeys.size
    ? `${selectedProfitKeys.size}種類を表示中。黒線・集計額・日別内訳は選択した種類の合計です。`
    : "表示する損益を選択してください。";
}

function saveProfitSelection() {
  localStorage.setItem(PROFIT_SELECTION_KEY, JSON.stringify([...selectedProfitKeys]));
  renderProfitChart();
}

function availableProfitYears(today = new Date()) {
  const currentYear = dateAtMidnight(today).getFullYear();
  const years = [2026, currentYear, currentYear + 1, profitYear];
  visibleDeposits().forEach(deposit => {
    years.push(Number(deposit.startDate?.slice(0, 4)), Number(deposit.maturityDate?.slice(0, 4)));
  });
  fxScopeOwners().forEach(owner => Object.keys(fxOwnerData(owner.id).realized).forEach(month => years.push(Number(month.slice(0, 4)))));
  const valid = years.filter(year => Number.isInteger(year) && year >= 1000 && year <= 9999);
  const first = Math.min(...valid), last = Math.max(...valid);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function datedProfitComponents(date, yearStart, today = new Date()) {
  const day = dateAtMidnight(date);
  const start = dateAtMidnight(yearStart);
  const current = dateAtMidnight(today);
  const result = { depositRealized: 0, depositUnrealized: 0, fxRealized: 0, fxUnrealized: 0 };
  if (day < start) return result;
  result.depositRealized = visibleDeposits().reduce((sum, deposit) => {
    if (deposit.currency !== SUPPORTED_FOREIGN_CURRENCY || !isMaturedOn(deposit, current)) return sum;
    const maturity = dateAtMidnight(deposit.maturityDate);
    if (maturity < start || maturity > day) return sum;
    return sum + principalFxGainLoss(deposit, maturity) + interestFxGainLoss(deposit, maturity);
  }, 0);
  result.fxRealized = fxScopeOwners().reduce((sum, owner) => {
    return sum + Object.entries(fxOwnerData(owner.id).realized).reduce((monthlySum, [month, values]) => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2026) return monthlySum;
      const monthEnd = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0);
      if (monthEnd < start || monthEnd > day) return monthlySum;
      return monthlySum + Object.values(values).reduce((companySum, value) => companySum + (Number(value) || 0), 0);
    }, 0);
  }, 0);
  // Valuation history is unavailable. Only show today's snapshots and undated
  // legacy realized amounts in the current calendar year, from today onwards.
  if (start.getFullYear() === current.getFullYear() && day >= current) {
    result.depositUnrealized = depositFxBreakdown(visibleDeposits(), current).unrealized;
    result.fxUnrealized = fxLedgerSummary().unsettledProfit;
    result.fxRealized += fxLegacyTotal();
  }
  return result;
}

function datedCurrencyGainLoss(date, yearStart, today = new Date()) {
  return Object.values(datedProfitComponents(date, yearStart, today)).reduce((sum, value) => sum + value, 0);
}

function cumulativeProfitOn(date, yearStart, net = true, today = new Date()) {
  const day = dateAtMidnight(date);
  if (day < dateAtMidnight(yearStart)) return 0;
  return cumulativeInterest(yearStart, day, net) + datedCurrencyGainLoss(day, yearStart, today);
}

function profitChartPoints(yearStart, yearEnd, today = new Date()) {
  let interest = 0;
  const points = [];
  for (let date = dateAtMidnight(yearStart); date <= dateAtMidnight(yearEnd); date = addDays(date, 1)) {
    interest += totalInterestOn(date, true);
    const values = { interest, ...datedProfitComponents(date, yearStart, today) };
    points.push({ date, values, value: Object.values(values).reduce((sum, value) => sum + value, 0) });
  }
  return points;
}

function stackProfitValues(values, seriesList = PROFIT_SERIES) {
  let positive = 0, negative = 0;
  const bands = {};
  seriesList.forEach(series => {
    const value = values[series.key] || 0;
    bands[series.key] = {
      positive: { bottom: positive, top: positive + Math.max(0, value) },
      negative: { bottom: negative, top: negative + Math.min(0, value) },
    };
    positive += Math.max(0, value);
    negative += Math.min(0, value);
  });
  return { bands, positive, negative, total: positive + negative };
}

function showProfitPoint(index) {
  if (!profitChartModel) return;
  const point = profitChartModel.points[Math.max(0, Math.min(index, profitChartModel.points.length - 1))];
  const dateText = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }).format(point.date);
  const status = point.date > profitChartModel.today ? "予測" : "実績";
  document.querySelector("#profitDetailHeading").textContent = `${dateText}の内訳（${status}）`;
  profitChartModel.series.forEach(series => {
    const element = document.querySelector(`#profitDetail-${series.key}`);
    const value = point.values[series.key];
    element.textContent = formatYen(value);
    element.classList.toggle("negative", value < 0);
  });
  document.querySelector("#profitPointTotal").textContent = formatYen(point.value);
}

function inspectProfitChart(event) {
  if (!profitChartModel) return;
  if (event.type === "pointermove" && event.pointerType === "touch") return;
  const bounds = els.profitChart.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * profitChartModel.width / bounds.width;
  const portion = Math.max(0, Math.min(1, (x - profitChartModel.padding.left) / profitChartModel.plotW));
  showProfitPoint(Math.round(portion * (profitChartModel.points.length - 1)));
}

function monthlyProfitRows(today = new Date(), year = dateAtMidnight(today).getFullYear()) {
  const day = dateAtMidnight(today);
  return Array.from({ length: 12 }, (_, month) => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const actualEnd = new Date(Math.min(day, end));
    const forecastStart = new Date(Math.max(addDays(day, 1), start));
    const actual = actualEnd >= start ? cumulativeInterest(start, actualEnd, true) : 0;
    const forecast = forecastStart <= end ? cumulativeInterest(forecastStart, end, true) : 0;
    return { month: month + 1, actual, forecast, total: actual + forecast,
      status: end <= day ? "実績" : start > day ? "予測" : "実績＋予測" };
  });
}

function renderMonthlyProfit() {
  const body = document.querySelector("#monthlyProfitBody");
  body.replaceChildren();
  const rows = monthlyProfitRows(new Date(), profitYear);
  document.querySelector("#monthlyProfitTitle").textContent = `${profitYear}年 月ごとの損益（利息分）`;
  document.querySelector("#monthlyProfitCaption").textContent = `${profitYear}年の月別税引後利息の実績と予測`;
  const totals = { actual: 0, forecast: 0, total: 0 };
  rows.forEach(row => {
    const tr = document.createElement("tr");
    const month = document.createElement("th");
    month.scope = "row";
    month.textContent = `${row.month}月`;
    const status = document.createElement("small");
    status.textContent = row.status;
    month.appendChild(status);
    tr.appendChild(month);
    ["actual", "forecast", "total"].forEach(key => {
      const td = document.createElement("td");
      td.textContent = formatYen(row[key]);
      totals[key] += row[key];
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  ["actual", "forecast", "total"].forEach(key => {
    document.querySelector(`#monthlyProfit-${key}`).textContent = formatYen(totals[key]);
  });
}

function renderProfitChart() {
  renderMonthlyProfit();
  renderProfitSeriesControls();
  const seriesList = selectedProfitSeries();
  const today = dateAtMidnight(new Date());
  const yearSelect = document.querySelector("#profitYear");
  yearSelect.replaceChildren(...availableProfitYears(today).map(year => new Option(`${year}年`, String(year))));
  yearSelect.value = String(profitYear);
  document.querySelector("#profitPeriod").textContent = `${profitYear}年1月1日〜12月31日`;
  const canvas = els.profitChart;
  const ctx = canvas.getContext("2d");
  const width = Math.max(320, canvas.parentElement.clientWidth);
  const height = 320;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  const padding = { left: width < 500 ? 64 : 88, right: 20, top: 20, bottom: 44 };
  const yearStart = new Date(profitYear, 0, 1);
  const yearEnd = new Date(profitYear, 11, 31);
  const totalDays = Math.max(1, diffDays(yearStart, yearEnd));
  const points = profitChartPoints(yearStart, yearEnd, today).map(point => {
    const filtered = filterProfitPoint(point);
    return { ...filtered, stack: stackProfitValues(filtered.values, seriesList) };
  });
  const actualPoints = points.filter(point => point.date <= today);
  const forecastPoints = points.filter(point => point.date >= today);
  const high = Math.max(...points.map(point => point.stack.positive), 1);
  const low = Math.min(...points.map(point => point.stack.negative), 0);
  const rawStep = (high - low) / 6;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].find(value => value >= rawStep / magnitude) * magnitude);
  const max = Math.ceil(high / step) * step;
  const min = Math.floor(low / step) * step;
  const range = max - min;
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const xFor = date => padding.left + plotW * diffDays(yearStart, date) / totalDays;
  const yFor = value => padding.top + plotH * (1 - (value - min) / range);

  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#667085";
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  const tickCount = Math.round(range / step);
  for (let i = 0; i <= tickCount; i++) {
    const value = max - step * i;
    const y = yFor(value);
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
    ctx.fillText(width < 600 ? formatCompactYen(value) : formatYen(value), 4, y + 4);
  }

  const drawBand = (linePoints, series, side, opacity) => {
    if (!linePoints.length) return;
    ctx.beginPath();
    linePoints.forEach((point, index) => {
      const x = xFor(point.date), y = yFor(point.stack.bands[series.key][side].top);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    for (let index = linePoints.length - 1; index >= 0; index--) {
      const point = linePoints[index];
      ctx.lineTo(xFor(point.date), yFor(point.stack.bands[series.key][side].bottom));
    }
    ctx.closePath(); ctx.fillStyle = series.color; ctx.globalAlpha = opacity; ctx.fill(); ctx.globalAlpha = 1;
  };
  seriesList.forEach(series => {
    ["positive", "negative"].forEach(side => {
      drawBand(actualPoints, series, side, 0.78);
      drawBand(forecastPoints, series, side, 0.28);
    });
  });

  ctx.strokeStyle = "#98a2b3"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padding.left, yFor(0)); ctx.lineTo(width - padding.right, yFor(0)); ctx.stroke();
  const drawTotal = (linePoints, forecast = false) => {
    if (!linePoints.length) return;
    ctx.strokeStyle = "#172033"; ctx.lineWidth = 2.5; ctx.setLineDash(forecast ? [7, 5] : []); ctx.beginPath();
    linePoints.forEach((point, index) => {
      if (index === 0) ctx.moveTo(xFor(point.date), yFor(point.value)); else ctx.lineTo(xFor(point.date), yFor(point.value));
    });
    ctx.stroke(); ctx.setLineDash([]);
  };
  drawTotal(actualPoints); drawTotal(forecastPoints, true);

  if (today >= yearStart && today <= yearEnd) {
    const todayX = xFor(today);
    ctx.strokeStyle = "#667085"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(todayX, padding.top); ctx.lineTo(todayX, height - padding.bottom); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#526174";
    ctx.fillText("今日", Math.min(width - padding.right - 26, todayX + 4), padding.top + 12);
  }
  ctx.fillStyle = "#667085";
  const ticks = width < 500 ? [yearStart, new Date(profitYear, 6, 1), yearEnd] : [yearStart, new Date(profitYear, 3, 1), new Date(profitYear, 6, 1), new Date(profitYear, 9, 1), yearEnd];
  ticks.forEach(date => {
    const label = formatDate(date), labelWidth = ctx.measureText(label).width;
    ctx.fillText(label, Math.min(width - labelWidth - 4, Math.max(padding.left, xFor(date) - labelWidth / 2)), height - 16);
  });

  if (!seriesList.length) {
    ctx.fillStyle = "#667085";
    ctx.textAlign = "center";
    ctx.fillText("表示する損益を選択してください", padding.left + plotW / 2, padding.top + plotH / 2);
    ctx.textAlign = "start";
  }
  const legend = document.querySelector("#profitLegend");
  legend.replaceChildren();
  [...seriesList, { key: "total", label: "選択した損益の合計（黒線）", color: "#172033" }].forEach(series => {
    const item = document.createElement("div"); item.className = "profit-legend-item";
    const label = document.createElement("span"); label.textContent = series.label;
    label.style.setProperty("--series-color", series.color);
    const amount = document.createElement("strong"); amount.id = series.key === "total" ? "profitPointTotal" : `profitDetail-${series.key}`;
    item.append(label, amount); legend.appendChild(item);
  });
  profitChartModel = { points, today, width, padding, plotW, series: seriesList };
  showProfitPoint(profitYear === today.getFullYear() ? diffDays(yearStart, today) : points.length - 1);
  const yearEndProfit = points[points.length - 1].value;
  const breakdown = document.querySelector("#profitBreakdown");
  if (profitYear < today.getFullYear()) breakdown.textContent = `${profitYear}年末累計 ${formatYen(yearEndProfit)}（実績）`;
  else if (profitYear > today.getFullYear()) breakdown.textContent = `${profitYear}年12月31日予測 ${formatYen(yearEndProfit)}`;
  else breakdown.textContent = `今日まで ${formatYen(points[diffDays(yearStart, today)].value)}｜12月31日予測 ${formatYen(yearEndProfit)}`;
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
  state.deposits = state.deposits.map(d => d.currency !== SUPPORTED_FOREIGN_CURRENCY || !isHeldOn(d, today) || (selectedOwnerId !== "all" && d.ownerId !== selectedOwnerId) ? d : normalizeDeposit({
    ...d,
    fxRate: rate,
    fxUpdatedAt: now,
  }));
  saveDeposits();
  render();
}

function render() {
  renderOwnerControls();
  renderFxLedger();
  renderSurplusFunds();
  renderSummary();
  renderDeposits();
  renderFxCalculationDetails();
  renderYieldChart();
  renderChart();
  renderProfitChart();
}

function openDialog(deposit = null) {
  els.form.reset();
  document.querySelector("#ownerId").value = selectedOwnerId === "all" ? DEFAULT_OWNER_ID : selectedOwnerId;
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
    ownerId: document.querySelector("#ownerId").value,
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
els.fxSettledProfit.addEventListener("input", () => {
  if (selectedOwnerId === "all") return;
  handleFxAmountInput(els.fxSettledProfit, value => {
    fxOwnerData(selectedOwnerId, true).legacyRealized = value;
    saveFxLedger();
  });
});
els.fxUnsettledProfit.addEventListener("input", () => {
  if (selectedOwnerId === "all") return;
  handleFxAmountInput(els.fxUnsettledProfit, value => {
    const data = fxOwnerData(selectedOwnerId, true);
    data.unrealized = value;
    data.updatedAt = new Date().toISOString();
    saveFxLedger();
    document.querySelector("#fxUnrealizedUpdatedAt").textContent = `最終更新：${new Date(data.updatedAt).toLocaleString("ja-JP")}`;
  });
});
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
  saveSurplusFunds();
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
  const headers = ["id","ownerId","ownerName","bankName","productName","currency","principal","annualRate","startDate","maturityDate","dayBasis","taxRate","initialFxRate","fxRate","interestReceiptFxRate","conversionFxRate","afterMaturity","fxUpdatedAt"];
  const lines = [headers.join(",")].concat(state.deposits.map(d =>
    headers.map(h => `"${String(h === "ownerName" ? ownerName(d.ownerId) : d[h] ?? "").replaceAll('"','""')}"`).join(",")
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
    if (obj.ownerName) {
      let owner = owners.find(o => o.name === obj.ownerName);
      if (!owner) {
        owner = { id: crypto.randomUUID(), name: obj.ownerName };
        owners.push(owner);
      }
      obj.ownerId = owner.id;
    }
    return normalizeDeposit(obj);
  });
  localStorage.setItem(OWNERS_STORAGE_KEY, JSON.stringify(owners));
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
  if (currentView !== "dashboard") return;
  renderYieldChart();
  renderChart();
  renderProfitChart();
});
window.addEventListener("hashchange", applyView);

els.surplusAmount.value = state.surplusFunds.amount || "";
els.surplusAnnualRate.value = state.surplusFunds.annualRate || "";
els.fxSettledProfit.value = fxLegacyTotal() || "";
els.fxUnsettledProfit.value = state.fxHedge.unsettledProfit || "";
saveFxLedger();
render();
applyView();

document.querySelector("#ownerSelector").addEventListener("change", event => {
  selectedOwnerId = event.target.value;
  localStorage.setItem("term-deposit-selected-owner-v1", selectedOwnerId);
  syncScopedInputs();
  render();
});
document.querySelector("#addOwnerButton").addEventListener("click", () => {
  const name = prompt("預金保有者の名前を入力してください（例：父、母）。")?.trim();
  if (!name) return;
  if (owners.some(o => o.name === name)) return alert("同じ名前の保有者が登録されています。");
  const owner = { id: crypto.randomUUID(), name };
  owners.push(owner);
  localStorage.setItem(OWNERS_STORAGE_KEY, JSON.stringify(owners));
  selectedOwnerId = owner.id;
  localStorage.setItem("term-deposit-selected-owner-v1", selectedOwnerId);
  syncScopedInputs();
  render();
});
document.querySelector("#renameOwnerButton").addEventListener("click", () => {
  if (selectedOwnerId === "all") return;
  const owner = owners.find(o => o.id === selectedOwnerId);
  const name = prompt("保有者の名前を変更します。", owner.name)?.trim();
  if (!name) return;
  if (owners.some(o => o.id !== owner.id && o.name === name)) return alert("同じ名前の保有者が登録されています。");
  owner.name = name;
  localStorage.setItem(OWNERS_STORAGE_KEY, JSON.stringify(owners));
  render();
});

document.querySelector("#addFxCompanyButton").addEventListener("click", addFxCompany);
document.querySelector("#fxYear").addEventListener("change", event => {
  fxYear = Number(event.target.value);
  renderFxLedger();
});

document.querySelector("#profitYear").addEventListener("change", event => {
  profitYear = Number(event.target.value);
  localStorage.setItem("term-deposit-profit-year-v1", String(profitYear));
  renderProfitChart();
});
els.profitChart.addEventListener("pointermove", inspectProfitChart);
els.profitChart.addEventListener("pointerdown", inspectProfitChart);

document.querySelector("#profitSeriesFilter").addEventListener("change", event => {
  const key = event.target.dataset.profitSeries;
  if (!PROFIT_SERIES.some(series => series.key === key)) return;
  if (event.target.checked) selectedProfitKeys.add(key); else selectedProfitKeys.delete(key);
  saveProfitSelection();
});
document.querySelector("#selectAllProfitSeries").addEventListener("click", () => {
  selectedProfitKeys = new Set(PROFIT_SERIES.map(series => series.key));
  saveProfitSelection();
});
document.querySelector("#clearProfitSeries").addEventListener("click", () => {
  selectedProfitKeys = new Set();
  saveProfitSelection();
});
