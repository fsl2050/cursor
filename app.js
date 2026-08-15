const STORAGE_KEY = "roommate-arbiter-v5";
const CHECKIN_KEY = "roommate-arbiter-checkin";

const PAYMENT_PROVIDERS = [
  { id: "venmo", label: "Venmo", placeholder: "@username", prefix: "@" },
  { id: "paypal", label: "PayPal", placeholder: "paypal.me/username", prefix: "" },
  { id: "cashapp", label: "Cash App", placeholder: "$cashtag", prefix: "$" },
  { id: "zelle", label: "Zelle", placeholder: "email or phone", prefix: "" },
];

const state = loadState();
let checkedInId = localStorage.getItem(CHECKIN_KEY) || "";
if (checkedInId && !state.roommates.some((r) => r.id === checkedInId)) {
  checkedInId = "";
  localStorage.removeItem(CHECKIN_KEY);
}

/** Block shadow IT: only same-origin /api/judge is allowed from the client. */
const _fetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.startsWith("http") && !url.startsWith(location.origin)) {
    return Promise.reject(new Error("Blocked: external fetch not allowed"));
  }
  if (url.includes("/api/") && !url.endsWith("/api/judge") && !url.endsWith("/api/food-chat")) {
    return Promise.reject(new Error("Blocked: unknown API route"));
  }
  return _fetch(input, init);
};

const els = {
  checkinSelect: document.getElementById("checkin-select"),
  roommateForm: document.getElementById("roommate-form"),
  roommateName: document.getElementById("roommate-name"),
  roommateList: document.getElementById("roommate-list"),
  expenseForm: document.getElementById("expense-form"),
  expensePayer: document.getElementById("expense-payer"),
  expenseAmount: document.getElementById("expense-amount"),
  expenseDesc: document.getElementById("expense-desc"),
  expenseList: document.getElementById("expense-list"),
  mealForm: document.getElementById("meal-form"),
  mealEater: document.getElementById("meal-eater"),
  mealShare: document.getElementById("meal-share"),
  mealItem: document.getElementById("meal-item"),
  mealExpense: document.getElementById("meal-expense"),
  mealList: document.getElementById("meal-list"),
  gripeForm: document.getElementById("gripe-form"),
  gripeAuthor: document.getElementById("gripe-author"),
  gripeText: document.getElementById("gripe-text"),
  gripeCount: document.getElementById("gripe-count"),
  gripeList: document.getElementById("gripe-list"),
  judgeBtn: document.getElementById("judge-btn"),
  verdictOutput: document.getElementById("verdict-output"),
  verdictMeta: document.getElementById("verdict-meta"),
  verdictText: document.getElementById("verdict-text"),
  verdictSplits: document.getElementById("verdict-splits"),
  verdictPayments: document.getElementById("verdict-payments"),
  verdictBalances: document.getElementById("verdict-balances"),
  judgeStatus: document.getElementById("judge-status"),
  grokConsentLabel: document.getElementById("grok-consent-label"),
  grokConsent: document.getElementById("grok-consent"),
  privacyContent: document.getElementById("privacy-content"),
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      if (raw.length > 500_000) throw new Error("Storage too large");
      return validateState(JSON.parse(raw)) || emptyState();
    }
    const legacy =
      localStorage.getItem("roommate-arbiter-v4") ||
      localStorage.getItem("roommate-arbiter-v3") ||
      localStorage.getItem("roommate-arbiter-v2") ||
      localStorage.getItem("roommate-arbiter-v1");
    if (legacy) return validateState(JSON.parse(legacy)) || emptyState();
  } catch (_) {}
  return emptyState();
}

function emptyState() {
  return {
    roommates: [],
    expenses: [],
    meals: [],
    gripes: [],
    missingItems: [],
    deliveryOrders: [],
    hangout: defaultHangout(),
  };
}

function migrateState(data) {
  return validateState(data) || emptyState();
}

function saveState() {
  const clean = validateState(state);
  if (clean) {
    state.roommates = clean.roommates;
    state.expenses = clean.expenses;
    state.meals = clean.meals;
    state.gripes = clean.gripes;
    state.missingItems = clean.missingItems;
    state.deliveryOrders = clean.deliveryOrders;
    state.hangout = clean.hangout;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function defaultPayments() {
  return { venmo: "", paypal: "", cashapp: "", zelle: "", preferred: "venmo" };
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return `${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}-${hex()}${hex()}${hex()}${hex()}-4${hex()}${hex()}${hex()}-8${hex()}${hex()}${hex()}-${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}`;
}

function formatMoney(n) {
  return `$${n.toFixed(2)}`;
}

function getRoommate(id) {
  return state.roommates.find((r) => r.id === id);
}

function normalizeHandle(provider, value) {
  return sanitizePaymentHandle(provider, value);
}

function buildPaymentUrl(provider, handle, amount, note) {
  if (!isSafeAmount(amount)) return null;
  const amt = amount.toFixed(2);
  const memo = encodeURIComponent(sanitizeText(note || "Roommate Arbiter settlement", 80));
  const h = normalizeHandle(provider, handle);
  if (!h || !isValidPaymentHandle(provider, h)) return null;

  let url;
  switch (provider) {
    case "venmo":
      url = `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(h)}&amount=${amt}&note=${memo}`;
      break;
    case "paypal":
      url = `https://paypal.me/${encodeURIComponent(h)}/${amt}`;
      break;
    case "cashapp":
      url = `https://cash.app/${encodeURIComponent(h.startsWith("$") ? h : "$" + h)}/${amt}`;
      break;
    default:
      return null;
  }
  return isAllowedPaymentUrl(url) ? url : null;
}

function getBestPaymentMethod(roommate) {
  if (!roommate?.payments) return null;
  const order = [
    roommate.payments.preferred,
    "venmo",
    "paypal",
    "cashapp",
    "zelle",
  ].filter(Boolean);

  for (const id of [...new Set(order)]) {
    const handle = roommate.payments[id];
    if (handle) return { provider: id, handle, ...PAYMENT_PROVIDERS.find((p) => p.id === id) };
  }
  return null;
}

function renderCheckin() {
  const options = state.roommates
    .map(
      (r) =>
        `<option value="${r.id}" ${r.id === checkedInId ? "selected" : ""}>${escapeHtml(r.name)}</option>`
    )
    .join("");
  els.checkinSelect.innerHTML = `<option value="">— pick your character —</option>${options}`;
}

function renderRoommates() {
  renderCheckin();

  els.roommateList.innerHTML = state.roommates
    .map((r) => {
      const isYou = r.id === checkedInId;
      const paymentFields = PAYMENT_PROVIDERS.map((p) => {
        const val = r.payments?.[p.id] ?? "";
        return `
          <label class="pay-field">
            ${p.label}
            <input
              type="text"
              data-roommate="${r.id}"
              data-payment="${p.id}"
              value="${escapeHtml(val)}"
              placeholder="${p.placeholder}"
              maxlength="80"
            />
          </label>`;
      }).join("");

      const preferredOptions = PAYMENT_PROVIDERS.map(
        (p) =>
          `<option value="${p.id}" ${r.payments?.preferred === p.id ? "selected" : ""}>${p.label}</option>`
      ).join("");

      const linked = PAYMENT_PROVIDERS.filter((p) => r.payments?.[p.id]).map((p) => p.label);
      const linkedBadge = linked.length
        ? `<span class="linked-badge">${linked.join(" · ")}</span>`
        : `<span class="linked-badge muted">payment links? in this economy?</span>`;

      return `
        <li class="roommate-card ${isYou ? "is-you" : ""}">
          <div class="roommate-card-head">
            <div>
              <strong>${escapeHtml(r.name)}</strong>
              ${isYou ? '<span class="you-badge">main character</span>' : ""}
              ${linkedBadge}
            </div>
            <button type="button" class="entry-remove" data-remove-roommate="${r.id}">×</button>
          </div>
          <div class="payment-grid">${paymentFields}</div>
          <label class="pay-field preferred-field">
            💰 Cash me out via
            <select data-roommate="${r.id}" data-payment-preferred>
              ${preferredOptions}
            </select>
          </label>
        </li>`;
    })
    .join("");

  const options = state.roommates.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");
  els.expensePayer.innerHTML = options || `<option value="">Add a roommate first</option>`;
  els.mealEater.innerHTML = options || `<option value="">Add a roommate first</option>`;
  els.gripeAuthor.innerHTML = options || `<option value="">Add a roommate first</option>`;

  if (checkedInId && getRoommate(checkedInId)) {
    els.gripeAuthor.value = checkedInId;
  }

  els.expenseForm.querySelector("button").disabled = state.roommates.length === 0;
  els.mealForm.querySelector("button").disabled = state.roommates.length === 0;
  els.gripeForm.querySelector("button").disabled = state.roommates.length === 0;
}

function renderExpenses() {
  els.expenseList.innerHTML = state.expenses
    .map((e) => {
      const payer = state.roommates.find((r) => r.id === e.payerId);
      return `
        <li class="entry">
          <div class="entry-main">
            <strong>${escapeHtml(payer?.name ?? "Unknown")}</strong> spent ${formatMoney(e.amount)}
            <div class="entry-meta">${escapeHtml(e.description)}</div>
          </div>
          <button type="button" class="entry-remove" data-remove-expense="${e.id}">×</button>
        </li>`;
    })
    .join("");

  const expenseOptions = state.expenses
    .map((e) => {
      const payer = state.roommates.find((r) => r.id === e.payerId);
      return `<option value="${e.id}">${escapeHtml(payer?.name ?? "?")} — ${formatMoney(e.amount)} (${escapeHtml(e.description)})</option>`;
    })
    .join("");

  els.mealExpense.innerHTML = `<option value="">Split equally — not tied to one purchase</option>${expenseOptions}`;
}

function renderMeals() {
  els.mealList.innerHTML = state.meals
    .map((m) => {
      const eater = state.roommates.find((r) => r.id === m.eaterId);
      const pct = Math.round(parseFloat(m.share) * 100);
      const linked = m.expenseId ? state.expenses.find((e) => e.id === m.expenseId) : null;
      const linkNote = linked
        ? ` → linked to ${formatMoney(linked.amount)} purchase`
        : " → general pool";
      return `
        <li class="entry">
          <div class="entry-main">
            <strong>${escapeHtml(eater?.name ?? "Unknown")}</strong> ate ${escapeHtml(m.item)} (${pct}%)
            <div class="entry-meta">${linkNote}</div>
          </div>
          <button type="button" class="entry-remove" data-remove-meal="${m.id}">×</button>
        </li>`;
    })
    .join("");
}

function renderGripes() {
  els.gripeList.innerHTML = (state.gripes || [])
    .map((g) => {
      const author = getRoommate(g.authorId);
      const isYou = g.authorId === checkedInId;
      return `
        <li class="gripe-entry ${isYou ? "is-you" : ""}">
          <div class="gripe-body">
            <div class="gripe-author">${escapeHtml(author?.name ?? "Unknown")}${isYou ? " · you" : ""}</div>
            <p class="gripe-text">"${escapeHtml(g.text)}"</p>
          </div>
          <button type="button" class="entry-remove" data-remove-gripe="${g.id}">×</button>
        </li>`;
    })
    .join("");
}

function renderAll() {
  renderRoommates();
  renderExpenses();
  renderMeals();
  renderGripes();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getJudgeMode() {
  return document.querySelector('input[name="judge-mode"]:checked')?.value ?? "demo";
}

/** Fair split math: who paid vs who consumed */
function computeBalances() {
  const balances = Object.fromEntries(state.roommates.map((r) => [r.id, 0]));

  for (const expense of state.expenses) {
    const linkedMeals = state.meals.filter((m) => m.expenseId === expense.id);
    if (expense.splitAmongIds?.length) {
      const share = expense.amount / expense.splitAmongIds.length;
      for (const id of expense.splitAmongIds) {
        if (balances[id] !== undefined) balances[id] -= share;
      }
      balances[expense.payerId] += expense.amount;
    } else if (linkedMeals.length === 0) {
      const share = expense.amount / state.roommates.length;
      for (const r of state.roommates) {
        balances[r.id] -= share;
      }
      balances[expense.payerId] += expense.amount;
    } else {
      const totalWeight = linkedMeals.reduce((s, m) => s + parseFloat(m.share), 0) || 1;
      for (const meal of linkedMeals) {
        const portion = expense.amount * (parseFloat(meal.share) / totalWeight);
        balances[meal.eaterId] -= portion;
      }
      balances[expense.payerId] += expense.amount;
    }
  }

  const unlinkedMeals = state.meals.filter((m) => !m.expenseId);
  if (unlinkedMeals.length > 0) {
    const phantomTotal = unlinkedMeals.reduce((s, m) => s + parseFloat(m.share) * 5, 0);
    const totalWeight = unlinkedMeals.reduce((s, m) => s + parseFloat(m.share), 0) || 1;
    for (const meal of unlinkedMeals) {
      balances[meal.eaterId] -= phantomTotal * (parseFloat(meal.share) / totalWeight);
    }
    const creditEach = phantomTotal / state.roommates.length;
    for (const r of state.roommates) balances[r.id] += creditEach;
  }

  return balances;
}

function balancesToSettlements(balances) {
  const debtors = [];
  const creditors = [];
  for (const [id, bal] of Object.entries(balances)) {
    if (bal < -0.01) debtors.push({ id, amount: -bal });
    if (bal > 0.01) creditors.push({ id, amount: bal });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    settlements.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return settlements;
}

const WITTY_OPENERS = [
  "After reviewing the receipts, the takeout boxes, and one deeply suspicious empty ice cream tub,",
  "Having heard testimony from the kitchen, the group chat, and a passive-aggressive sticky note,",
  "In the case of Who Swiped the Card vs. Who Swiped the Snacks,",
  "Following a forensic audit of your shared fridge (it was mostly vibes and old salsa),",
  "The court has crunched the numbers, the drama, and Dave's 'I'll pay you back' energy,",
];

const WITTY_CLOSERS = [
  "Court adjourned. May your next Costco run not end in betrayal.",
  "Pay up before someone 'accidentally' finishes your oat milk. You know who you are.",
  "Justice served — lukewarm, like the pizza someone definitely said they'd split.",
  "This ruling is final. Take it to the group chat if you dare.",
  "Gavel dropped. Venmo requests are officially in season.",
];

const CALLOUTS = [
  (name, item) => `${name} logged "${item}" — self-snitching is a bold legal strategy.`,
  (name, amt) => `${name} fronted ${formatMoney(amt)}. Main character or control freak? Jury's out.`,
  (name) => `${name} keeps showing up in the snacc log. Curious. Very curious.`,
  () => `Someone bought stuff nobody admitted to eating. The classic roommate cold case.`,
  () => `The math is clean. The vibes are not. Not my jurisdiction.`,
];

function demoVerdict() {
  const balances = computeBalances();
  const settlements = balancesToSettlements(balances);
  const opener = pick(WITTY_OPENERS);
  const closer = pick(WITTY_CLOSERS);

  const callouts = [];
  const nameCounts = {};
  for (const m of state.meals) {
    nameCounts[m.eaterId] = (nameCounts[m.eaterId] || 0) + 1;
    const eater = state.roommates.find((r) => r.id === m.eaterId);
    if (Math.random() > 0.5) callouts.push(pick(CALLOUTS)(eater?.name, m.item));
  }
  for (const e of state.expenses) {
    const payer = state.roommates.find((r) => r.id === e.payerId);
    if (Math.random() > 0.6) callouts.push(pick(CALLOUTS)(payer?.name, e.amount));
  }
  for (const [id, count] of Object.entries(nameCounts)) {
    if (count >= 2) {
      const n = state.roommates.find((r) => r.id === id);
      callouts.push(pick(CALLOUTS)(n?.name));
    }
  }
  if (callouts.length === 0) callouts.push(pick(CALLOUTS)());

  if (state.gripes?.length) {
    const gripe = pick(state.gripes);
    const author = getRoommate(gripe.authorId);
    callouts.push(`${author?.name} filed a grievance: "${gripe.text}" — noted for the record.`);
  }

  const totalSpent = state.expenses.reduce((s, e) => s + e.amount, 0);
  const middle = settlements.length
    ? `I find ${settlements.length} transfer${settlements.length > 1 ? "s" : ""} required to restore cosmic balance on ${formatMoney(totalSpent)} in shared spending.`
    : `Everyone is square at ${formatMoney(totalSpent)} total — statistically suspicious, but I'll allow it.`;

  return {
    verdict: `${opener} ${middle} ${pick(callouts)} ${closer}`,
    settlements,
    balances,
    judge: "Chaos Bot 3000 (offline)",
  };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function grokVerdict() {
  if (location.protocol === "file:") {
    throw new Error("Live Grok requires the app server (npm start). Demo mode works offline.");
  }
  if (!els.grokConsent.checked) {
    throw new Error("Confirm the Grok data consent checkbox before sending data.");
  }

  const payload = buildGrokPayload(state, computeBalances, balancesToSettlements);
  const err = validateGrokPayload(payload);
  if (err) throw new Error(err);

  const res = await fetch("/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.error || `Grok unavailable (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  const data = await res.json();
  const balances = computeBalances();
  const settlements = balancesToSettlements(balances);

  return {
    verdict: sanitizeVerdict(data.verdict),
    settlements,
    balances,
    judge: "Grok — Chief Drama Officer",
  };
}

function showVerdict(result) {
  els.verdictOutput.classList.remove("hidden");
  els.verdictMeta.textContent = `Ruled by ${result.judge} · ${new Date().toLocaleString()}`;
  els.verdictText.textContent = result.verdict;

  const splitHtml =
    result.settlements.length === 0
      ? "<p class='entry-meta'>Everyone's square. Either you're all saints or someone's lying. 🕊️</p>"
      : `<h3>💸 Who Pays Who</h3>${result.settlements
          .map((s) => {
            const fromR = getRoommate(s.from);
            const toR = getRoommate(s.to);
            const from = fromR?.name ?? "?";
            const to = toR?.name ?? "?";
            const isYourDebt = checkedInId && s.from === checkedInId;
            const payBtn = renderPayButton(toR, s.amount, `Arbiter: ${from} owes ${to}`);
            return `
              <div class="split-row ${isYourDebt ? "your-debt" : ""}">
                <div class="split-info">
                  <span>${escapeHtml(from)} → ${escapeHtml(to)}</span>
                  ${isYourDebt ? '<span class="debt-tag">👈 your L</span>' : ""}
                </div>
                <div class="split-actions">
                  <span class="amount">${formatMoney(s.amount)}</span>
                  ${payBtn}
                </div>
              </div>`;
          })
          .join("")}`;

  els.verdictSplits.innerHTML = splitHtml;
  els.verdictPayments.innerHTML = renderPaymentsPanel(result.settlements);
  els.verdictPayments.classList.toggle("hidden", result.settlements.length === 0);

  els.verdictBalances.innerHTML = `<h3>📊 The Scoreboard</h3>${state.roommates
    .map((r) => {
      const bal = result.balances[r.id] ?? 0;
      const cls = bal > 0.01 ? "credit" : bal < -0.01 ? "owes" : "";
      const label = bal > 0.01 ? "gets paid" : bal < -0.01 ? "in debt" : "chilling";
      const isYou = r.id === checkedInId ? ' <span class="you-badge">main character</span>' : "";
      return `<div class="balance-row ${cls}"><span>${escapeHtml(r.name)} ${label}${isYou}</span><span class="amount">${formatMoney(Math.abs(bal))}</span></div>`;
    })
    .join("")}`;
}

function renderPayButton(creditor, amount, note) {
  if (!creditor) return "";
  const method = getBestPaymentMethod(creditor);
  if (!method) {
    return `<span class="pay-missing" title="Creditor has no payment link">ghost mode 👻</span>`;
  }

  if (method.provider === "zelle") {
    return `<button type="button" class="btn btn-pay btn-zelle" data-copy-zelle="${escapeHtml(method.handle)}" data-amount="${amount}">
      Copy Zelle · ${formatMoney(amount)}
    </button>`;
  }

  const url = buildPaymentUrl(method.provider, method.handle, amount, note);
  if (!url) return "";
  return `<a class="btn btn-pay" href="${url}" target="_blank" rel="noopener noreferrer">
    Pay via ${method.label} · ${formatMoney(amount)}
  </a>`;
}

function renderPaymentsPanel(settlements) {
  if (!checkedInId) {
    return `<div class="payments-checkin-prompt">
      <h3>💳 Time to pay up</h3>
      <p>Pick <strong>Who's you?</strong> above to unlock your personal shame buttons.</p>
    </div>`;
  }

  const yours = settlements.filter((s) => s.from === checkedInId);
  if (yours.length === 0) {
    return `<div class="payments-checkin-prompt success">
      <h3>✨ You're off the hook</h3>
      <p>Zero debt. Either you're innocent or you're really good at hiding receipts.</p>
    </div>`;
  }

  const you = getRoommate(checkedInId);
  return `
    <h3>🫵 ${escapeHtml(you?.name ?? "You")} — cough it up</h3>
    <p class="entry-meta">One tap. Pre-filled amount. Minimal dignity required.</p>
    ${yours
      .map((s) => {
        const toR = getRoommate(s.to);
        return `
          <div class="pay-card">
            <div>
              <strong>Pay ${escapeHtml(toR?.name ?? "?")}</strong>
              <div class="entry-meta">${formatMoney(s.amount)} per the ruling</div>
            </div>
            ${renderPayButton(toR, s.amount, `Roommate Arbiter: ${you?.name} owes ${toR?.name}`)}
          </div>`;
      })
      .join("")}`;
}

function renderPrivacyPanel() {
  els.privacyContent.innerHTML = `
    <div><h4>Stays on your device</h4><ul>${DATA_FLOW.local.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>
    <div><h4>Sent to Grok only (if you opt in)</h4><ul>${DATA_FLOW.grokOnly.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>
    <div><h4>Payment apps (you click Pay)</h4><ul>${DATA_FLOW.paymentApps.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>
    <div><h4>Never happens</h4><ul>${DATA_FLOW.never.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>
  `;
}

function updateGrokConsentVisibility() {
  const grok = getJudgeMode() === "grok";
  els.grokConsentLabel.classList.toggle("hidden", !grok);
  if (!grok) els.grokConsent.checked = false;
}

document.querySelectorAll('input[name="judge-mode"]').forEach((el) => {
  el.addEventListener("change", updateGrokConsentVisibility);
});

function setStatus(msg, isError = false) {
  els.judgeStatus.classList.remove("hidden", "error");
  if (!msg) {
    els.judgeStatus.classList.add("hidden");
    return;
  }
  els.judgeStatus.textContent = msg;
  if (isError) els.judgeStatus.classList.add("error");
  else els.judgeStatus.classList.remove("error");
}

// Event listeners
els.roommateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = sanitizeName(els.roommateName.value);
  if (!name) return;
  if (state.roommates.length >= LIMITS.maxRoommates) {
    setStatus(`Max ${LIMITS.maxRoommates} roommates — this isn't a hostel.`, true);
    return;
  }
  if (state.roommates.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
    els.roommateName.value = "";
    return;
  }
  state.roommates.push({ id: uid(), name, payments: defaultPayments() });
  els.roommateName.value = "";
  saveState();
  renderAll();
});

els.roommateList.addEventListener("click", (e) => {
  const id = e.target.dataset.removeRoommate;
  if (!id) return;
  state.roommates = state.roommates.filter((r) => r.id !== id);
  state.expenses = state.expenses.filter((x) => x.payerId !== id);
  state.meals = state.meals.filter((m) => m.eaterId !== id);
  state.gripes = (state.gripes || []).filter((g) => g.authorId !== id);
  state.missingItems = (state.missingItems || []).filter(
    (m) => m.reportedBy !== id && !m.culpritIds.includes(id)
  );
  state.deliveryOrders = (state.deliveryOrders || []).filter((o) => o.payerId !== id);
  if (state.hangout) {
    state.hangout.presentIds = state.hangout.presentIds.filter((pid) => pid !== id);
    delete state.hangout.moods[id];
    for (const s of state.hangout.suggestions || []) {
      s.votes = s.votes.filter((vid) => vid !== id);
    }
    state.hangout.messages = (state.hangout.messages || []).filter(
      (m) => m.authorId !== id
    );
  }
  if (checkedInId === id) {
    checkedInId = "";
    localStorage.removeItem(CHECKIN_KEY);
  }
  saveState();
  renderAll();
});

els.roommateList.addEventListener("input", (e) => {
  const { roommate: id, payment } = e.target.dataset;
  if (!id || !payment) return;
  const r = getRoommate(id);
  if (!r) return;
  const cleaned = sanitizePaymentHandle(payment, e.target.value);
  r.payments[payment] = cleaned;
  const valid = isValidPaymentHandle(payment, cleaned);
  e.target.closest(".pay-field")?.classList.toggle("invalid", !valid && cleaned.length > 0);
  saveState();
});

els.roommateList.addEventListener("blur", (e) => {
  if (e.target.dataset.payment) renderRoommates();
}, true);

els.roommateList.addEventListener("change", (e) => {
  const id = e.target.dataset.roommate;
  if (e.target.dataset.paymentPreferred && id) {
    const r = getRoommate(id);
    if (r) {
      r.payments.preferred = e.target.value;
      saveState();
      renderRoommates();
    }
  }
});

els.checkinSelect.addEventListener("change", (e) => {
  const id = e.target.value;
  if (id && !getRoommate(id)) {
    e.target.value = "";
    return;
  }
  checkedInId = id;
  if (checkedInId) localStorage.setItem(CHECKIN_KEY, checkedInId);
  else localStorage.removeItem(CHECKIN_KEY);
  renderRoommates();
  renderGripes();
});

els.verdictOutput.addEventListener("click", async (e) => {
  const zelle = e.target.dataset.copyZelle;
  const amount = e.target.dataset.amount;
  if (!zelle) return;
  try {
    await navigator.clipboard.writeText(zelle);
    e.target.textContent = "Copied Zelle info!";
    setTimeout(() => {
      e.target.textContent = `Copy Zelle · ${formatMoney(parseFloat(amount))}`;
    }, 2000);
  } catch (_) {
    prompt("Copy this Zelle contact:", zelle);
  }
});

els.expenseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!state.roommates.length || state.expenses.length >= LIMITS.maxExpenses) return;
  const amount = parseFloat(els.expenseAmount.value);
  const description = sanitizeText(els.expenseDesc.value, LIMITS.maxTextLen);
  const payerId = els.expensePayer.value;
  if (!getRoommate(payerId) || !isSafeAmount(amount) || !description) {
    setStatus("Invalid expense. Check amount and description.", true);
    return;
  }
  state.expenses.push({
    id: uid(),
    payerId,
    amount,
    description,
  });
  els.expenseAmount.value = "";
  els.expenseDesc.value = "";
  saveState();
  renderAll();
});

els.expenseList.addEventListener("click", (e) => {
  const id = e.target.dataset.removeExpense;
  if (!id) return;
  state.expenses = state.expenses.filter((x) => x.id !== id);
  state.meals = state.meals.map((m) => (m.expenseId === id ? { ...m, expenseId: "" } : m));
  saveState();
  renderAll();
});

els.mealForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!state.roommates.length || state.meals.length >= LIMITS.maxMeals) return;
  const eaterId = els.mealEater.value;
  const item = sanitizeText(els.mealItem.value, LIMITS.maxTextLen);
  const share = els.mealShare.value;
  const expenseId = els.mealExpense.value;
  if (!getRoommate(eaterId) || !item) {
    setStatus("Invalid meal entry.", true);
    return;
  }
  state.meals.push({
    id: uid(),
    eaterId,
    item,
    share,
    expenseId: expenseId && state.expenses.some((x) => x.id === expenseId) ? expenseId : "",
  });
  els.mealItem.value = "";
  saveState();
  renderAll();
});

els.mealList.addEventListener("click", (e) => {
  const id = e.target.dataset.removeMeal;
  if (!id) return;
  state.meals = state.meals.filter((m) => m.id !== id);
  saveState();
  renderAll();
});

els.gripeText.addEventListener("input", () => {
  els.gripeCount.textContent = `${els.gripeText.value.length}/280`;
});

els.gripeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!state.roommates.length) return;
  if ((state.gripes || []).length >= LIMITS.maxGripes) {
    setStatus("Grievance box is full. The court has heard enough.", true);
    return;
  }
  const authorId = els.gripeAuthor.value;
  const text = sanitizeText(els.gripeText.value, LIMITS.maxGripeLen);
  if (!getRoommate(authorId) || !text) {
    setStatus("Say something spicy or go home.", true);
    return;
  }
  if (!state.gripes) state.gripes = [];
  state.gripes.push({ id: uid(), authorId, text });
  els.gripeText.value = "";
  els.gripeCount.textContent = "0/280";
  saveState();
  renderAll();
  setStatus("Grievance filed. Grok is taking notes. 📝");
  setTimeout(() => setStatus(""), 2500);
});

els.gripeList.addEventListener("click", (e) => {
  const id = e.target.dataset.removeGripe;
  if (!id) return;
  state.gripes = (state.gripes || []).filter((g) => g.id !== id);
  saveState();
  renderAll();
});

els.judgeBtn.addEventListener("click", async () => {
  if (state.roommates.length < 2) {
    setStatus("Need at least 2 roommates. Solo drama isn't billable.", true);
    return;
  }
  if (state.expenses.length === 0 && state.meals.length === 0 && !(state.gripes || []).length) {
    setStatus("Log receipts, snaccs, or a grievance first. Grok needs material.", true);
    return;
  }

  els.judgeBtn.classList.add("loading");
  els.judgeBtn.disabled = true;
  setStatus("⚡ Grok is putting on the robe…");

  try {
    const mode = getJudgeMode();
    let result;
    if (mode === "grok") {
      try {
        result = await grokVerdict();
      } catch (err) {
        setStatus(`Live Grok failed (${err.message}). Falling back to demo roast...`, true);
        result = demoVerdict();
        result.judge = "Demo fallback (Grok unavailable)";
      }
    } else {
      result = demoVerdict();
    }
    showVerdict(result);
    setStatus("");
  } catch (err) {
    setStatus(err.message || "The Arbiter is unavailable. Try demo mode.", true);
  } finally {
    els.judgeBtn.classList.remove("loading");
    els.judgeBtn.disabled = false;
  }
});

renderAll();
renderPrivacyPanel();
updateGrokConsentVisibility();

window.RA = {
  state,
  saveState,
  renderAll,
  getRoommate,
  formatMoney,
  escapeHtml,
  uid,
  getCheckedInId: () => checkedInId,
  renderPayButton,
  setStatus,
};
