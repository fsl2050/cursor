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
            <div class="roommate-card-meta">
              <strong>${escapeHtml(r.name)}</strong>
              ${isYou ? '<span class="you-badge">main character</span>' : ""}
              ${linkedBadge}
            </div>
            <button type="button" class="entry-remove" data-remove-roommate="${r.id}">×</button>
          </div>
          <details class="payment-details"${linked.length ? " open" : ""}>
            <summary>Payment links</summary>
            <div class="payment-grid">${paymentFields}</div>
            <label class="pay-field preferred-field">
              💰 Cash me out via
              <select data-roommate="${r.id}" data-payment-preferred>
                ${preferredOptions}
              </select>
            </label>
          </details>
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
  setCheckedInId(id);
});

function triggerRenderAll() {
  if (window.RA?.renderAll) window.RA.renderAll();
  else renderAll();
}

function setCheckedInId(id) {
  if (id && !getRoommate(id)) return;
  checkedInId = id || "";
  if (checkedInId) localStorage.setItem(CHECKIN_KEY, checkedInId);
  else localStorage.removeItem(CHECKIN_KEY);
  if (els.checkinSelect) els.checkinSelect.value = checkedInId;
  renderRoommates();
  renderGripes();
}

function addRoommate(name) {
  const clean = sanitizeName(name);
  if (!clean) return null;
  if (state.roommates.length >= LIMITS.maxRoommates) return null;
  if (state.roommates.some((r) => r.name.toLowerCase() === clean.toLowerCase())) return null;
  const roommate = { id: uid(), name: clean, payments: defaultPayments() };
  state.roommates.push(roommate);
  saveState();
  triggerRenderAll();
  return roommate.id;
}

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

window.RA = {
  state,
  saveState,
  renderAll,
  getRoommate,
  formatMoney,
  escapeHtml,
  uid,
  getCheckedInId: () => checkedInId,
  setCheckedInId,
  addRoommate,
  renderPayButton,
  setStatus,
};

/** CraveBot sidebar — wired here so Add + presence work in one bundle */
function ensureHangoutState() {
  if (!state.hangout) state.hangout = defaultHangout();
}

function renderChatIdentitySelect() {
  const sel = document.getElementById("chat-identity");
  if (!sel) return;
  sel.innerHTML =
    `<option value="">— pick yourself —</option>` +
    state.roommates
      .map(
        (r) =>
          `<option value="${r.id}" ${r.id === checkedInId ? "selected" : ""}>${escapeHtml(r.name)}</option>`
      )
      .join("");
}

function renderPresenceList() {
  ensureHangoutState();
  const list = document.getElementById("presence-list");
  const badge = document.getElementById("quorum-badge");
  if (!list) return;

  if (!state.roommates.length) {
    list.innerHTML = `<p class="entry-meta">Add roommates above, then tap <strong>Home</strong>.</p>`;
    if (badge) {
      badge.className = "quorum-badge quorum-no";
      badge.textContent = "Add roommates first";
    }
    return;
  }

  list.innerHTML = state.roommates
    .map((r) => {
      const present = state.hangout.presentIds.includes(r.id);
      const isYou = r.id === checkedInId;
      const status = present
        ? `<span class="home-badge">Home</span>`
        : `<span class="away-badge">Away</span>`;
      const btn = present
        ? `<button type="button" class="btn btn-sm btn-ghost" data-leave-room="${r.id}">Away</button>`
        : `<button type="button" class="btn btn-sm btn-sky" data-join-room="${r.id}">Home</button>`;
      return `
        <div class="presence-row ${present ? "present" : ""}">
          <span class="presence-dot" aria-hidden="true"></span>
          <span class="presence-name">${escapeHtml(r.name)}${isYou ? " (you)" : ""}</span>
          ${status}
          ${btn}
        </div>`;
    })
    .join("");

  const n = state.roommates.length;
  const p = state.hangout.presentIds.length;
  if (badge) {
    if (n >= 2 && p === n) {
      badge.className = "quorum-badge quorum-yes";
      badge.textContent = `✓ All ${n} roommates home — ready to order!`;
    } else {
      badge.className = "quorum-badge quorum-no";
      badge.textContent = `${p}/${n} home${n < 2 ? " (need 2+ roommates)" : ""}`;
    }
  }
}

function renderSidebar() {
  renderChatIdentitySelect();
  renderPresenceList();
}

function wireSidebarAdd() {
  const form = document.getElementById("chat-add-roommate");
  const input = document.getElementById("chat-roommate-name");
  const status = document.getElementById("chat-status");
  if (!form || !input) return;

  const showChatStatus = (msg, isError = false) => {
    if (!status) return;
    status.classList.remove("hidden", "error");
    status.textContent = msg;
    status.classList.toggle("error", isError);
    if (!isError) setTimeout(() => status.classList.add("hidden"), 2500);
  };

  const handleAdd = (e) => {
    if (e) e.preventDefault();
    const id = addRoommate(input.value);
    if (!id) {
      showChatStatus("Couldn't add — empty name, duplicate, or list full.", true);
      return;
    }
    setCheckedInId(id);
    input.value = "";
    renderSidebar();
    showChatStatus(`Added ${getRoommate(id)?.name} ✓`);
  };

  form.addEventListener("submit", handleAdd);
  document.getElementById("chat-add-btn")?.addEventListener("click", handleAdd);
  document.getElementById("chat-identity")?.addEventListener("change", (e) => {
    setCheckedInId(e.target.value);
    renderAll();
  });
}

const _renderAllCore = renderAll;
renderAll = function renderAllWithSidebar() {
  _renderAllCore();
  renderSidebar();
};
window.RA.renderAll = renderAll;

wireSidebarAdd();
renderSidebar();

renderAll();
renderPrivacyPanel();
updateGrokConsentVisibility();

/**
 * CraveBot — mood-based group food chat sidebar
 * Presence check-in, collective mood, suggestions, order placement
 */
(function () {
  const MOODS = [
    { id: "lazy", emoji: "\uD83D\uDE34", label: "Lazy", tags: ["pizza", "burgers", "ramen"] },
    { id: "spicy", emoji: "\uD83C\uDF36\uFE0F", label: "Spicy", tags: ["thai", "hot chicken", "curry"] },
    { id: "broke", emoji: "\uD83D\uDCB8", label: "Broke", tags: ["tacos", "pizza deals", "fried rice"] },
    { id: "party", emoji: "\uD83C\uDF89", label: "Party", tags: ["wings", "sushi platter", "nachos"] },
    { id: "healthy", emoji: "\uD83E\uDD57", label: "Healthy", tags: ["salad bowl", "poke", "grain bowl"] },
    { id: "sad", emoji: "\uD83D\uDE22", label: "Sad", tags: ["mac and cheese", "soup", "ice cream"] },
    { id: "adventurous", emoji: "\uD83C\uDF0D", label: "Adventurous", tags: ["ethiopian", "korean bbq", "dim sum"] },
    { id: "comfort", emoji: "\uD83D\uDECB\uFE0F", label: "Comfort", tags: ["meatloaf", "mashed potatoes", "grilled cheese"] },
  ];

  const DEMO_SUGGESTIONS = {
    lazy: [
      { name: "Classic pepperoni pizza", vibe: "zero effort, max payoff" },
      { name: "Double cheeseburger combo", vibe: "couch royalty" },
      { name: "Instant-upgrade ramen bowl", vibe: "lazy but fancy" },
    ],
    spicy: [
      { name: "Thai drunken noodles", vibe: "sweat equity" },
      { name: "Nashville hot chicken", vibe: "pain is pleasure" },
      { name: "Spicy tuna poke bowl", vibe: "heat with credentials" },
    ],
    broke: [
      { name: "Street tacos (6 pack)", vibe: "wallet-friendly chaos" },
      { name: "Domino's two-topping deal", vibe: "financially responsible-ish" },
      { name: "Fried rice + egg roll", vibe: "bulk for the buck" },
    ],
    party: [
      { name: "Buffalo wings platter", vibe: "finger food diplomacy" },
      { name: "Loaded nachos supreme", vibe: "shareable mess" },
      { name: "Sushi party tray", vibe: "classy chaos" },
    ],
    healthy: [
      { name: "Mediterranean grain bowl", vibe: "glow-up energy" },
      { name: "Custom poke bowl", vibe: "fresh flex" },
      { name: "Grilled chicken salad", vibe: "responsible adult cosplay" },
    ],
    sad: [
      { name: "Mac and cheese with bacon", vibe: "emotional support dairy" },
      { name: "Chicken noodle soup", vibe: "hug in a bowl" },
      { name: "Ben & Jerry's pint", vibe: "dessert therapy" },
    ],
    adventurous: [
      { name: "Korean fried chicken", vibe: "bold crunch" },
      { name: "Ethiopian combo platter", vibe: "injera adventure" },
      { name: "Dim sum sampler", vibe: "cart-based roulette" },
    ],
    comfort: [
      { name: "Grilled cheese + tomato soup", vibe: "childhood reboot" },
      { name: "Meatloaf dinner plate", vibe: "mom energy" },
      { name: "Chicken pot pie", vibe: "warm blanket food" },
    ],
  };

  const els = {
    sidebar: document.getElementById("food-chat-sidebar"),
    toggle: document.getElementById("chat-toggle"),
    headerOpen: document.getElementById("chat-open-header"),
    closeBtn: document.getElementById("chat-close"),
    chatIdentity: document.getElementById("chat-identity"),
    chatAddForm: document.getElementById("chat-add-roommate"),
    chatRoommateName: document.getElementById("chat-roommate-name"),
    presenceList: document.getElementById("presence-list"),
    quorumBadge: document.getElementById("quorum-badge"),
    moodPicker: document.getElementById("mood-picker"),
    messages: document.getElementById("chat-messages"),
    participants: document.getElementById("chat-participants"),
    sendingAs: document.getElementById("chat-sending-as"),
    suggestions: document.getElementById("chat-suggestions"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatMode: document.getElementById("chat-mode"),
    suggestBtn: document.getElementById("suggest-btn"),
    orderPanel: document.getElementById("chat-order-panel"),
    orderPlatform: document.getElementById("chat-order-platform"),
    orderPayer: document.getElementById("chat-order-payer"),
    orderTotal: document.getElementById("chat-order-total"),
    orderFee: document.getElementById("chat-order-fee"),
    orderForm: document.getElementById("chat-order-form"),
    clearHangout: document.getElementById("clear-hangout"),
    chatStatus: document.getElementById("chat-status"),
  };

  let thinking = false;

  function ensureHangout() {
    if (!window.RA) return false;
    if (!RA.state.hangout) RA.state.hangout = defaultHangout();
    return true;
  }

  function getMood(id) {
    return MOODS.find((m) => m.id === id);
  }

  function buildDeliveryUrl(platform, query) {
    if (RA.buildDeliveryUrl) return RA.buildDeliveryUrl(platform, query);
    const q = encodeURIComponent(sanitizeText(query, 80));
    let url;
    if (platform === "doordash") url = `https://www.doordash.com/convenience/search?query=${q}`;
    else if (platform === "ubereats") url = `https://www.ubereats.com/search?q=${q}`;
    else return null;
    return isAllowedDeliveryUrl(url) ? url : null;
  }

  function isQuorum() {
    const n = RA.state.roommates.length;
    return n >= 2 && RA.state.hangout.presentIds.length === n;
  }

  function allPresentHaveMoods() {
    return RA.state.hangout.presentIds.every((id) => RA.state.hangout.moods[id]);
  }

  function addMessage(role, text, authorId = "") {
    RA.state.hangout.messages.push({
      id: RA.uid(),
      role,
      text: sanitizeText(text, LIMITS.maxTextLen),
      authorId: authorId || "",
    });
    if (RA.state.hangout.messages.length > LIMITS.maxHangoutMessages) {
      RA.state.hangout.messages = RA.state.hangout.messages.slice(-LIMITS.maxHangoutMessages);
    }
  }

  function addSystemMessage(text) {
    addMessage("system", text);
  }

  const ACCENT_COUNT = 6;

  function authorAccentClass(authorId) {
    if (!authorId) return "chat-accent-0";
    let hash = 0;
    for (let i = 0; i < authorId.length; i++) hash = (hash + authorId.charCodeAt(i) * (i + 1)) % ACCENT_COUNT;
    return `chat-accent-${hash}`;
  }

  function setChatStatus(msg, isError = false) {
    if (!els.chatStatus) return;
    els.chatStatus.classList.toggle("hidden", !msg);
    els.chatStatus.textContent = msg || "";
    els.chatStatus.classList.toggle("error", isError);
  }

  function dominantMoods() {
    const counts = {};
    for (const id of RA.state.hangout.presentIds) {
      const mood = RA.state.hangout.moods[id];
      if (mood) counts[mood] = (counts[mood] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  }

  function demoSuggestions() {
    const tops = dominantMoods();
    const primary = tops[0] || "lazy";
    const secondary = tops[1];
    const pool = [...(DEMO_SUGGESTIONS[primary] || DEMO_SUGGESTIONS.lazy)];
    if (secondary && DEMO_SUGGESTIONS[secondary]) {
      pool.push(DEMO_SUGGESTIONS[secondary][0]);
    }
    const seen = new Set();
    const picks = [];
    for (const s of pool) {
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      picks.push({ ...s, id: RA.uid(), votes: [] });
      if (picks.length >= 3) break;
    }
    return picks;
  }

  function demoReply(userText) {
    const names = RA.state.hangout.presentIds.map((id) => RA.getRoommate(id)?.name).filter(Boolean);
    const room = names.length ? names.join(", ") : "the room";
    const tops = dominantMoods().map((m) => getMood(m)?.label).filter(Boolean);
    const vibe = tops.length ? tops.join(" + ") : "mystery";
    const lower = userText.toLowerCase();
    if (/cheap|broke|budget|afford/.test(lower)) {
      return `Alright ${room} — broke mode activated. With ${vibe} vibes in the room, I'd hunt deals: tacos, pizza promos, or fried rice. Everyone vote below.`;
    }
    if (/healthy|salad|light|diet/.test(lower)) {
      return `Health-conscious crew? Bold of you, ${room}. Bowls, poke, or grilled options — still compatible with ${vibe} energy.`;
    }
    if (/spicy|hot|heat/.test(lower)) {
      return `Turning up the heat for ${room}. Thai, hot chicken, or curry could settle this ${vibe} debate.`;
    }
    if (/surprise|pick|decide|idk|don't know/.test(lower)) {
      return `Reading the room (${room}): ${vibe} energy detected. I pulled 3 options — vote as a democracy or argue it out.`;
    }
    if (isQuorum()) {
      return `Full house — ${room} are all here! Collective mood: ${vibe}. Check the suggestions, vote, then order together.`;
    }
    return `Got it from ${room}: "${sanitizeText(userText, 60)}". Current vibe mix: ${vibe}. Need everyone home + moods for the official group order.`;
  }

  async function grokReply(userText) {
    const present = RA.state.hangout.presentIds.map((id) => RA.getRoommate(id)?.name).filter(Boolean);
    const moods = {};
    for (const id of RA.state.hangout.presentIds) {
      const name = RA.getRoommate(id)?.name;
      const mood = RA.state.hangout.moods[id];
      if (name && mood) moods[name] = mood;
    }
    const recent = RA.state.hangout.messages.map((m) => ({
      role: m.role,
      text: m.text,
      authorName: m.authorId ? RA.getRoommate(m.authorId)?.name : "",
    }));
    const payload = buildFoodChatPayload(present, moods, recent, userText);
    const err = validateFoodChatPayload(payload);
    if (err) throw new Error(err);

    const res = await fetch("/api/food-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "CraveBot unavailable");
    return data;
  }

  async function runBot(userText, autoSuggest = false) {
    if (thinking) return;
    thinking = true;
    setChatStatus("CraveBot is thinking…");
    renderChat();

    try {
      let reply;
      let suggestions = [];

      if (els.chatMode?.value === "grok") {
        try {
          const data = await grokReply(userText);
          reply = sanitizeFoodChatReply(data.reply);
          suggestions = (data.suggestions || []).slice(0, 3).map((s) => ({
            id: RA.uid(),
            name: sanitizeText(s.name, LIMITS.maxTextLen),
            vibe: sanitizeText(s.vibe || "", 80),
            votes: [],
          }));
        } catch (err) {
          reply = demoReply(userText) + " (Grok fallback — " + err.message + ")";
          suggestions = demoSuggestions();
        }
      } else {
        reply = autoSuggest ? buildAutoSuggestIntro() : demoReply(userText);
        suggestions = demoSuggestions();
      }

      addMessage("bot", reply);
      if (suggestions.length) {
        RA.state.hangout.suggestions = suggestions;
        RA.state.hangout.pickedId = "";
      }
      RA.saveState();
      setChatStatus("");
    } catch (err) {
      setChatStatus(err.message, true);
    } finally {
      thinking = false;
      renderChat();
    }
  }

  function buildAutoSuggestIntro() {
    const names = RA.state.hangout.presentIds.map((id) => RA.getRoommate(id)?.name).filter(Boolean);
    const moodLabels = dominantMoods().map((m) => getMood(m)?.label);
    if (isQuorum()) {
      return `Quorum reached! ${names.join(", ")} are all here. Mood board: ${moodLabels.join(", ") || "undecided"}. Here are 3 group picks — vote together, then order!`;
    }
    return `Hangout update for ${names.join(", ") || "the room"}. Moods: ${moodLabels.join(", ") || "pick one!"}. Suggestions when you're ready:`;
  }

  function renderParticipants() {
    if (!els.participants) return;
    const present = RA.state.hangout.presentIds
      .map((id) => RA.getRoommate(id))
      .filter(Boolean);
    if (!present.length) {
      els.participants.innerHTML = `<span class="chat-participant chat-participant-empty">No one home yet — tap Home to join group chat</span>`;
      return;
    }
    els.participants.innerHTML = `
      <span class="chat-participant chat-participant-agent">CraveBot</span>
      ${present
        .map((r) => {
          const you = r.id === RA.getCheckedInId();
          return `<span class="chat-participant ${authorAccentClass(r.id)} ${you ? "is-you" : ""}">${RA.escapeHtml(r.name)}${you ? " (you)" : ""}</span>`;
        })
        .join("")}`;
  }

  function renderIdentitySelect() {
    if (!els.chatIdentity) return;
    const you = RA.getCheckedInId();
    const opts = RA.state.roommates
      .map((r) => `<option value="${r.id}" ${r.id === you ? "selected" : ""}>${RA.escapeHtml(r.name)}</option>`)
      .join("");
    els.chatIdentity.innerHTML = `<option value="">— pick yourself —</option>${opts}`;
  }

  function renderPresence() {
    if (!els.presenceList || !ensureHangout()) return;

    if (!RA.state.roommates.length) {
      els.presenceList.innerHTML = `<p class="entry-meta">Add at least 2 roommates above to start a group order.</p>`;
      if (els.quorumBadge) {
        els.quorumBadge.className = "quorum-badge quorum-no";
        els.quorumBadge.textContent = "Add roommates first";
      }
      return;
    }

    const you = RA.getCheckedInId();

    els.presenceList.innerHTML = RA.state.roommates
      .map((r) => {
        const present = RA.state.hangout.presentIds.includes(r.id);
        const mood = RA.state.hangout.moods[r.id];
        const moodLabel = mood ? getMood(mood)?.label : "";
        const isYou = r.id === you;
        const status = present ? `<span class="home-badge">Home</span>` : `<span class="away-badge">Away</span>`;
        const toggleBtn = present
          ? `<button type="button" class="btn btn-sm btn-ghost" data-leave-room="${r.id}">Away</button>`
          : `<button type="button" class="btn btn-sm btn-sky" data-join-room="${r.id}">Home</button>`;
        return `
        <div class="presence-row ${present ? "present" : ""}">
          <span class="presence-dot" aria-hidden="true"></span>
          <span class="presence-name">${RA.escapeHtml(r.name)}${isYou ? " (you)" : ""}</span>
          ${status}
          <span class="presence-mood">${moodLabel}</span>
          ${toggleBtn}
        </div>`;
      })
      .join("");

    const n = RA.state.roommates.length;
    const p = RA.state.hangout.presentIds.length;
    if (els.quorumBadge) {
      if (isQuorum()) {
        els.quorumBadge.className = "quorum-badge quorum-yes";
        els.quorumBadge.textContent = `✓ All ${n} roommates home — ready to order!`;
      } else {
        els.quorumBadge.className = "quorum-badge quorum-no";
        els.quorumBadge.textContent = `${p}/${n} home${n < 2 ? " (need 2+ roommates)" : ""}`;
      }
    }
  }

  function renderMoodPicker() {
    if (!els.moodPicker) return;
    const you = RA.getCheckedInId();
    const present = you && RA.state.hangout.presentIds.includes(you);
    const yourMood = you ? RA.state.hangout.moods[you] : "";

    if (!present) {
      els.moodPicker.innerHTML = `<p class="entry-meta">Mark yourself <strong>Home</strong> first, then pick your mood.</p>`;
      return;
    }

    els.moodPicker.innerHTML = `
      <p class="mood-label">Your vibe today</p>
      <div class="mood-grid">
        ${MOODS.map(
          (m) => `
          <button type="button" class="mood-chip ${yourMood === m.id ? "active" : ""}" data-mood="${m.id}">
            ${m.label}
          </button>`
        ).join("")}
      </div>`;
  }

  function renderMessages() {
    if (!els.messages) return;
    const you = RA.getCheckedInId();
    if (!RA.state.hangout.messages.length) {
      els.messages.innerHTML = `<p class="chat-empty">Group chat is empty. Mark roommates Home, switch <strong>Who are you?</strong>, then message each other and CraveBot.</p>`;
      return;
    }
    els.messages.innerHTML = RA.state.hangout.messages
      .map((m) => {
        if (m.role === "system") {
          return `<div class="chat-bubble system"><p>${RA.escapeHtml(m.text)}</p></div>`;
        }
        if (m.role === "bot") {
          return `
        <div class="chat-bubble agent">
          <span class="chat-author">CraveBot · agent</span>
          <p>${RA.escapeHtml(m.text)}</p>
        </div>`;
        }
        const name = RA.escapeHtml(RA.getRoommate(m.authorId)?.name || "Roommate");
        const isYou = m.authorId === you;
        return `
        <div class="chat-bubble roommate ${authorAccentClass(m.authorId)} ${isYou ? "is-you" : ""}">
          <span class="chat-author">${name}${isYou ? " · you" : ""}</span>
          <p>${RA.escapeHtml(m.text)}</p>
        </div>`;
      })
      .join("");
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function renderSuggestions() {
    if (!els.suggestions) return;
    const you = RA.getCheckedInId();
    const present = you && RA.state.hangout.presentIds.includes(you);
    const sugs = RA.state.hangout.suggestions;

    if (!sugs.length) {
      els.suggestions.innerHTML = `<p class="entry-meta">Set moods, then ask CraveBot or hit Get suggestions.</p>`;
      return;
    }

    els.suggestions.innerHTML = `
      <p class="mood-label">Group picks — tap to vote</p>
      ${sugs
        .map((s) => {
          const voted = s.votes.includes(you);
          const winner = RA.state.hangout.pickedId === s.id;
          const voteCount = s.votes.length;
          return `
          <div class="suggestion-card ${winner ? "picked" : ""} ${voted ? "voted" : ""}">
            <div class="suggestion-main">
              <strong>${RA.escapeHtml(s.name)}</strong>
              <span class="entry-meta">${RA.escapeHtml(s.vibe)} · ${voteCount} vote${voteCount !== 1 ? "s" : ""}</span>
            </div>
            <div class="suggestion-actions">
              ${present ? `<button type="button" class="btn btn-sm btn-ghost" data-vote="${s.id}">${voted ? "✓ Voted" : "Vote"}</button>` : ""}
              ${winner && isQuorum() ? `<span class="winner-tag">👑 Winner</span>` : ""}
            </div>
          </div>`;
        })
        .join("")}`;

    updatePickedFromVotes();
    renderOrderPanel();
  }

  function updatePickedFromVotes() {
    const sugs = RA.state.hangout.suggestions;
    if (!sugs.length) return;
    let best = sugs[0];
    for (const s of sugs) {
      if (s.votes.length > best.votes.length) best = s;
    }
    if (best.votes.length > 0) RA.state.hangout.pickedId = best.id;
  }

  function getPickedSuggestion() {
    return RA.state.hangout.suggestions.find((s) => s.id === RA.state.hangout.pickedId);
  }

  function renderOrderPanel() {
    if (!els.orderPanel) return;
    const picked = getPickedSuggestion();
    const canOrder = isQuorum() && picked;

    if (!canOrder) {
      els.orderPanel.classList.add("hidden");
      return;
    }

    els.orderPanel.classList.remove("hidden");
    const platform = RA.state.hangout.platform || "doordash";
    const dd = buildDeliveryUrl("doordash", picked.name);
    const ue = buildDeliveryUrl("ubereats", picked.name);

    const opts = RA.state.roommates.map((r) => `<option value="${r.id}">${RA.escapeHtml(r.name)}</option>`).join("");
    if (els.orderPayer) els.orderPayer.innerHTML = opts;
    const you = RA.getCheckedInId();
    if (you && els.orderPayer) els.orderPayer.value = you;
    if (els.orderPlatform) els.orderPlatform.value = platform;

    const launchEl = els.orderPanel.querySelector(".order-launch-btns");
    if (launchEl) {
      launchEl.innerHTML = `
        ${dd ? `<a class="btn btn-dd btn-sm" href="${dd}" target="_blank" rel="noopener noreferrer">DoorDash</a>` : ""}
        ${ue ? `<a class="btn btn-ue btn-sm" href="${ue}" target="_blank" rel="noopener noreferrer">Uber Eats</a>` : ""}`;
    }
  }

  function renderChat() {
    if (!ensureHangout()) return;
    renderIdentitySelect();
    renderPresence();
    renderMoodPicker();
    renderParticipants();
    renderMessages();
    renderSuggestions();

    const you = RA.getCheckedInId();
    const youName = you ? RA.getRoommate(you)?.name : "";
    const youHome = you && RA.state.hangout.presentIds.includes(you);
    const canSuggest = RA.state.hangout.presentIds.length >= 1 && allPresentHaveMoods();
    if (els.suggestBtn) els.suggestBtn.disabled = !canSuggest || thinking;
    if (els.sendingAs) {
      if (!you) {
        els.sendingAs.textContent = "Pick who you are to join the group chat.";
      } else if (!youHome) {
        els.sendingAs.textContent = `${youName}: tap Home first to join the group chat.`;
      } else {
        els.sendingAs.textContent = `Sending as ${youName} — switch Who are you? for another roommate.`;
      }
    }
    if (els.chatInput) {
      els.chatInput.disabled = thinking;
      els.chatInput.placeholder = youHome
        ? "Message the group…"
        : you
          ? "Tap Home to join group chat"
          : "Pick who you are above";
    }
  }

  function addRoommateFromSidebar(name) {
    const clean = sanitizeName(name);
    if (!clean) {
      setChatStatus("Enter a valid name.", true);
      return null;
    }
    if (typeof RA.addRoommate === "function") {
      return RA.addRoommate(clean);
    }
    if (RA.state.roommates.length >= LIMITS.maxRoommates) {
      setChatStatus("Roommate list is full.", true);
      return null;
    }
    if (RA.state.roommates.some((r) => r.name.toLowerCase() === clean.toLowerCase())) {
      setChatStatus("That roommate already exists.", true);
      return null;
    }
    const id = RA.uid();
    RA.state.roommates.push({
      id,
      name: clean,
      payments: { venmo: "", paypal: "", cashapp: "", zelle: "", preferred: "venmo" },
    });
    RA.saveState();
    if (RA.renderAll) RA.renderAll();
    return id;
  }

  function selectIdentity(id) {
    if (typeof RA.setCheckedInId === "function") {
      RA.setCheckedInId(id);
    } else if (id) {
      localStorage.setItem("roommate-arbiter-checkin", id);
    }
    renderChat();
  }

  let chatReady = false;

  function initFoodChat() {
    if (chatReady) return;
    if (!ensureHangout()) {
      setTimeout(initFoodChat, 50);
      return;
    }

    chatReady = true;

    // Drop garbled messages from earlier broken UTF-8 bundle
    if (
      RA.state.hangout.messages.some((m) => /[\uFFFD]|â|ð/.test(m.text)) ||
      RA.state.hangout.messages.some((m) => m.role === "bot" && /Step 1: add roommates/.test(m.text))
    ) {
      RA.state.hangout.messages = [];
      RA.state.hangout.suggestions = [];
      RA.saveState();
    }

    renderChat();

    // Add roommate + identity select wired in app.js (works even if this file 404s)

    function openChat() {
      els.sidebar?.classList.add("open");
      els.sidebar?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      window.setTimeout(() => els.chatInput?.focus(), 200);
    }

    els.toggle?.addEventListener("click", openChat);
    els.headerOpen?.addEventListener("click", openChat);
    els.closeBtn?.addEventListener("click", () => {
      els.sidebar?.classList.remove("open");
    });

    els.presenceList?.addEventListener("click", (e) => {
      const join = e.target.dataset.joinRoom;
      const leave = e.target.dataset.leaveRoom;
      const roommateId = join || leave;
      if (!roommateId || !RA.getRoommate(roommateId)) return;
      const name = RA.getRoommate(roommateId)?.name;

      if (join) {
        if (!RA.state.hangout.presentIds.includes(roommateId)) {
          RA.state.hangout.presentIds.push(roommateId);
          addSystemMessage(`${name} joined the group chat`);
          RA.saveState();
          renderChat();
        }
      }
      if (leave) {
        RA.state.hangout.presentIds = RA.state.hangout.presentIds.filter((id) => id !== roommateId);
        delete RA.state.hangout.moods[roommateId];
        addSystemMessage(`${name} left the group chat`);
        RA.saveState();
        renderChat();
      }
    });

    els.moodPicker?.addEventListener("click", (e) => {
      const mood = e.target.closest("[data-mood]")?.dataset.mood;
      const you = RA.getCheckedInId();
      if (!mood || !you || !RA.state.hangout.presentIds.includes(you)) return;
      RA.state.hangout.moods[you] = mood;
      const m = getMood(mood);
      const youName = RA.getRoommate(you)?.name || "Someone";
      addMessage("user", `I'm feeling ${m?.label}`, you);
      addSystemMessage(`${youName} set mood: ${m?.label}`);
      RA.saveState();
      renderChat();

      if (allPresentHaveMoods() && RA.state.hangout.presentIds.length >= 2) {
        runBot("", true);
      }
    });

    els.chatForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const you = RA.getCheckedInId();
      const text = sanitizeText(els.chatInput.value, LIMITS.maxTextLen);
      if (!text) return;
      if (!you) {
        setChatStatus("Pick who you are in the sidebar first.", true);
        return;
      }
      if (!RA.state.hangout.presentIds.includes(you)) {
        setChatStatus("Mark yourself Home first.", true);
        return;
      }
      addMessage("user", text, you);
      els.chatInput.value = "";
      RA.saveState();
      renderChat();
      runBot(text);
    });

    els.suggestBtn?.addEventListener("click", () => runBot("", true));

    els.suggestions?.addEventListener("click", (e) => {
      const voteId = e.target.dataset.vote;
      const you = RA.getCheckedInId();
      if (!voteId || !you || !RA.state.hangout.presentIds.includes(you)) return;
      for (const s of RA.state.hangout.suggestions) {
        s.votes = s.votes.filter((id) => id !== you);
      }
      const target = RA.state.hangout.suggestions.find((s) => s.id === voteId);
      if (target) {
        target.votes.push(you);
        const voter = RA.getRoommate(you)?.name || "Someone";
        addMessage("user", `I vote for ${target.name}`, you);
      }
      updatePickedFromVotes();
      RA.saveState();
      renderChat();
    });

    els.orderPlatform?.addEventListener("change", () => {
      RA.state.hangout.platform = els.orderPlatform.value;
      RA.saveState();
      renderOrderPanel();
    });

    els.orderForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!isQuorum()) {
        setChatStatus("Everyone must be in the room to log a group order.", true);
        return;
      }
      const picked = getPickedSuggestion();
      if (!picked) {
        setChatStatus("Vote on a suggestion first.", true);
        return;
      }
      const payerId = els.orderPayer.value;
      const total = parseFloat(els.orderTotal.value);
      const fee = parseFloat(els.orderFee.value) || 0;
      const platform = els.orderPlatform.value;
      const grandTotal = total + fee;
      const presentIds = [...RA.state.hangout.presentIds];

      if (!RA.getRoommate(payerId) || !isSafeAmount(total)) {
        setChatStatus("Enter a valid total.", true);
        return;
      }

      const platformLabel = platform === "ubereats" ? "Uber Eats" : "DoorDash";
      RA.state.expenses.push({
        id: RA.uid(),
        payerId,
        amount: grandTotal,
        description: sanitizeText(`Group ${platformLabel}: ${picked.name}`, LIMITS.maxTextLen),
        splitAmongIds: presentIds,
      });

      RA.state.deliveryOrders.push({
        id: RA.uid(),
        platform,
        total: grandTotal,
        payerId,
        itemIds: [],
        culpritIds: presentIds.filter((id) => id !== payerId),
        at: new Date().toISOString(),
      });

      addMessage("bot", `Order logged: ${picked.name} for ${RA.formatMoney(grandTotal)} split ${presentIds.length} ways. Bon appetit!`);
      els.orderTotal.value = "";
      els.orderFee.value = "";
      RA.saveState();
      RA.renderAll();
      renderChat();
      setChatStatus("Group order saved — check balances in the main app.");
      setTimeout(() => setChatStatus(""), 4000);
    });

    els.clearHangout?.addEventListener("click", () => {
      RA.state.hangout = defaultHangout();
      RA.saveState();
      renderChat();
      setChatStatus("Hangout cleared. Fresh start.");
      setTimeout(() => setChatStatus(""), 2500);
    });

    const origRenderAll = RA.renderAll;
    RA.renderAll = function () {
      origRenderAll();
      renderChat();
    };

    RA.buildDeliveryUrl = buildDeliveryUrl;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFoodChat);
  } else {
    initFoodChat();
  }
})();
