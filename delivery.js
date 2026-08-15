/**
 * Restock Express — missing items, DoorDash/Uber Eats deep links, charge culprits
 */
(function () {
  const els = {
    missingForm: document.getElementById("missing-form"),
    missingItem: document.getElementById("missing-item"),
    missingQty: document.getElementById("missing-qty"),
    missingEst: document.getElementById("missing-est"),
    missingReporter: document.getElementById("missing-reporter"),
    missingCulprits: document.getElementById("missing-culprits"),
    missingList: document.getElementById("missing-list"),
    deliveryCart: document.getElementById("delivery-cart"),
    orderForm: document.getElementById("order-form"),
    orderPayer: document.getElementById("order-payer"),
    orderTotal: document.getElementById("order-total"),
    orderFee: document.getElementById("order-fee"),
    orderPlatform: document.getElementById("order-platform"),
    chargePanel: document.getElementById("charge-panel"),
    deliveryHistory: document.getElementById("delivery-history"),
    deliveryStatus: document.getElementById("delivery-status"),
    autoCulpritBtn: document.getElementById("auto-culprit-btn"),
  };

  let cartIds = [];

  function ensureState() {
    if (!window.RA) return false;
    if (!RA.state.missingItems) RA.state.missingItems = [];
    if (!RA.state.deliveryOrders) RA.state.deliveryOrders = [];
    return true;
  }

  function buildDeliveryUrl(platform, query) {
    const q = encodeURIComponent(sanitizeText(query, 80));
    let url;
    if (platform === "doordash") {
      url = `https://www.doordash.com/convenience/search?query=${q}`;
    } else if (platform === "ubereats") {
      url = `https://www.ubereats.com/search?q=${q}`;
    } else return null;
    return isAllowedDeliveryUrl(url) ? url : null;
  }

  function inferCulprits(itemName) {
    const needle = itemName.toLowerCase();
    const words = needle.split(/\s+/).filter((w) => w.length > 2);
    const scores = {};

    for (const m of RA.state.meals || []) {
      const mealText = m.item.toLowerCase();
      const match = mealText.includes(needle) || words.some((w) => mealText.includes(w));
      if (match) scores[m.eaterId] = (scores[m.eaterId] || 0) + parseFloat(m.share);
    }

    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    if (sorted.length) return sorted;

    const reporter = els.missingReporter?.value;
    return RA.state.roommates.filter((r) => r.id !== reporter).map((r) => r.id);
  }

  function setDeliveryStatus(msg, isError = false) {
    if (!els.deliveryStatus) return;
    els.deliveryStatus.classList.remove("hidden", "error");
    if (!msg) {
      els.deliveryStatus.classList.add("hidden");
      return;
    }
    els.deliveryStatus.textContent = msg;
    els.deliveryStatus.classList.toggle("error", isError);
  }

  function renderMissingSelectors() {
    if (!ensureState()) return;
    const opts = RA.state.roommates
      .map((r) => `<option value="${r.id}">${RA.escapeHtml(r.name)}</option>`)
      .join("");
    const empty = `<option value="">Add roommates first</option>`;
    if (els.missingReporter) els.missingReporter.innerHTML = opts || empty;
    if (els.orderPayer) els.orderPayer.innerHTML = opts || empty;

    const you = RA.getCheckedInId();
    if (you && RA.getRoommate(you)) {
      if (els.missingReporter) els.missingReporter.value = you;
      if (els.orderPayer) els.orderPayer.value = you;
    }
    renderCulpritCheckboxes([]);
  }

  function renderCulpritCheckboxes(selectedIds) {
    if (!els.missingCulprits) return;
    if (!RA.state.roommates.length) {
      els.missingCulprits.innerHTML = `<p class="entry-meta">Add roommates to assign culprits.</p>`;
      return;
    }
    els.missingCulprits.innerHTML = RA.state.roommates
      .map(
        (r) => `
      <label class="culprit-chip">
        <input type="checkbox" value="${r.id}" ${selectedIds.includes(r.id) ? "checked" : ""} />
        ${RA.escapeHtml(r.name)}
      </label>`
      )
      .join("");
  }

  function getSelectedCulprits() {
    return [...(els.missingCulprits?.querySelectorAll("input:checked") || [])].map((c) => c.value);
  }

  function renderDeliveryCart(openItems) {
    if (!els.deliveryCart) return;
    const inCart = openItems.filter((m) => cartIds.includes(m.id));
    if (inCart.length === 0) {
      els.deliveryCart.innerHTML = `<p class="entry-meta cart-empty">Add missing items to the cart, then launch DoorDash or Uber Eats.</p>`;
      return;
    }
    const totalEst = inCart.reduce((s, m) => s + m.estCost * m.qty, 0);
    const query = inCart.map((m) => m.item).join(" ");
    const dd = buildDeliveryUrl("doordash", query);
    const ue = buildDeliveryUrl("ubereats", query);
    els.deliveryCart.innerHTML = `
      <h3 class="subsection-title">🛒 Restock cart (${inCart.length})</h3>
      <ul class="cart-items">${inCart.map((m) => `<li>${RA.escapeHtml(m.item)} ×${m.qty}</li>`).join("")}</ul>
      <p class="cart-est">Estimated subtotal: ${RA.formatMoney(totalEst)} + fees at checkout</p>
      <div class="cart-launch">
        ${dd ? `<a class="btn btn-dd" href="${dd}" target="_blank" rel="noopener noreferrer">🚀 Order on DoorDash</a>` : ""}
        ${ue ? `<a class="btn btn-ue" href="${ue}" target="_blank" rel="noopener noreferrer">🚀 Order on Uber Eats</a>` : ""}
      </div>
      <p class="entry-meta">Opens a search with your items. Complete checkout there, then log the real total below.</p>`;
  }

  function renderMissingItems() {
    if (!ensureState() || !els.missingList) return;
    const open = RA.state.missingItems.filter((m) => m.status === "open");

    if (!RA.state.missingItems.length) {
      els.missingList.innerHTML = "";
      renderDeliveryCart(open);
      return;
    }

    els.missingList.innerHTML = RA.state.missingItems
      .map((m) => {
        const reporter = RA.getRoommate(m.reportedBy);
        const culprits = m.culpritIds.map((id) => RA.getRoommate(id)?.name || "?").join(", ");
        const statusBadge =
          m.status === "open"
            ? `<span class="status-open">needs restock</span>`
            : `<span class="status-done">charged</span>`;
        const dd = buildDeliveryUrl("doordash", m.item);
        const ue = buildDeliveryUrl("ubereats", m.item);
        const inCart = cartIds.includes(m.id);
        const cartBtn =
          m.status === "open"
            ? `<button type="button" class="btn btn-sm ${inCart ? "btn-cart-active" : "btn-cart"}" data-add-cart="${m.id}">${inCart ? "✓ in cart" : "+ cart"}</button>`
            : "";
        const links =
          m.status === "open"
            ? `<div class="delivery-links">
            ${dd ? `<a class="btn btn-sm btn-dd" href="${dd}" target="_blank" rel="noopener noreferrer">DD</a>` : ""}
            ${ue ? `<a class="btn btn-sm btn-ue" href="${ue}" target="_blank" rel="noopener noreferrer">UE</a>` : ""}
          </div>`
            : "";
        return `
        <li class="missing-entry ${m.status}">
          <div class="missing-main">
            <strong>${RA.escapeHtml(m.item)}</strong> ×${m.qty} ${statusBadge}
            <div class="entry-meta">est ${RA.formatMoney(m.estCost)} · culprits: ${RA.escapeHtml(culprits || "TBD")} · filed by ${RA.escapeHtml(reporter?.name || "?")}</div>
          </div>
          <div class="missing-actions">${cartBtn}${links}
            <button type="button" class="entry-remove" data-remove-missing="${m.id}" aria-label="Remove">×</button>
          </div>
        </li>`;
      })
      .join("");

    renderDeliveryCart(open);
  }

  function computeCulpritCharges(total, culpritIds, payerId) {
    if (!culpritIds.length) return [];
    const share = total / culpritIds.length;
    return culpritIds
      .filter((id) => id !== payerId)
      .map((id) => ({ from: id, to: payerId, amount: share }));
  }

  function renderChargePanel(charges, payerId) {
    if (!els.chargePanel) return;
    if (!charges.length) {
      els.chargePanel.innerHTML = "";
      els.chargePanel.classList.add("hidden");
      return;
    }
    const payer = RA.getRoommate(payerId);
    els.chargePanel.classList.remove("hidden");
    els.chargePanel.innerHTML = `
      <h3 class="subsection-title">💸 Charge the culprits</h3>
      <p class="entry-meta">${RA.escapeHtml(payer?.name ?? "Orderer")} fronted the delivery — collect below.</p>
      ${charges
        .map((c) => {
          const from = RA.getRoommate(c.from);
          const to = RA.getRoommate(c.to);
          const payBtn = RA.renderPayButton(to, c.amount, `Restock: ${from?.name} owes ${to?.name}`);
          return `
          <div class="pay-card">
            <div>
              <strong>${RA.escapeHtml(from?.name ?? "?")}</strong> owes ${RA.escapeHtml(to?.name ?? "?")}
              <div class="entry-meta">${RA.formatMoney(c.amount)}</div>
            </div>
            ${payBtn}
          </div>`;
        })
        .join("")}`;
  }

  function renderDeliveryHistory() {
    if (!els.deliveryHistory || !ensureState()) return;
    const orders = [...(RA.state.deliveryOrders || [])].reverse().slice(0, 10);
    if (!orders.length) {
      els.deliveryHistory.innerHTML = "";
      return;
    }
    els.deliveryHistory.innerHTML = `
      <h3 class="subsection-title">📋 Recent restock runs</h3>
      <ul class="entry-list delivery-orders">
        ${orders
          .map((o) => {
            const payer = RA.getRoommate(o.payerId);
            const culprits = o.culpritIds.map((id) => RA.getRoommate(id)?.name || "?").join(", ");
            const platform = o.platform === "ubereats" ? "Uber Eats" : "DoorDash";
            return `<li class="order-entry">
              <strong>${platform}</strong> · ${RA.formatMoney(o.total)}
              <div class="entry-meta">${RA.escapeHtml(payer?.name ?? "?")} paid · culprits: ${RA.escapeHtml(culprits)}</div>
            </li>`;
          })
          .join("")}
      </ul>`;
  }

  function initDelivery() {
    if (!ensureState()) {
      setTimeout(initDelivery, 50);
      return;
    }

    renderMissingSelectors();
    renderMissingItems();
    renderDeliveryHistory();

    els.autoCulpritBtn?.addEventListener("click", () => {
      const item = els.missingItem?.value.trim();
      if (!item) {
        setDeliveryStatus("Enter an item name first.", true);
        return;
      }
      const culprits = inferCulprits(item);
      renderCulpritCheckboxes(culprits);
      setDeliveryStatus(`Auto-detected ${culprits.length} suspect(s) from snacc logs.`);
      setTimeout(() => setDeliveryStatus(""), 2500);
    });

    els.missingForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      if ((RA.state.missingItems || []).length >= LIMITS.maxMissingItems) {
        setDeliveryStatus("Missing items list is full.", true);
        return;
      }
      const item = sanitizeText(els.missingItem.value, LIMITS.maxTextLen);
      const qty = Math.max(1, Math.min(99, parseInt(els.missingQty.value, 10) || 1));
      const estCost = parseFloat(els.missingEst.value) || 5;
      const reportedBy = els.missingReporter.value;
      let culpritIds = getSelectedCulprits();
      if (!culpritIds.length) culpritIds = inferCulprits(item);
      if (!item || !RA.getRoommate(reportedBy)) return;

      RA.state.missingItems.push({
        id: RA.uid(),
        item,
        qty,
        estCost: isSafeAmount(estCost) ? estCost : 5,
        reportedBy,
        culpritIds: culpritIds.filter((id) => RA.getRoommate(id)),
        status: "open",
      });
      els.missingItem.value = "";
      els.missingQty.value = "1";
      els.missingEst.value = "";
      RA.saveState();
      RA.renderAll();
      setDeliveryStatus("Missing item logged. Add to cart or order solo.");
      setTimeout(() => setDeliveryStatus(""), 2500);
    });

    els.missingList?.addEventListener("click", (e) => {
      const removeId = e.target.dataset.removeMissing;
      if (removeId) {
        RA.state.missingItems = RA.state.missingItems.filter((m) => m.id !== removeId);
        cartIds = cartIds.filter((id) => id !== removeId);
        RA.saveState();
        RA.renderAll();
        return;
      }
      const cartId = e.target.dataset.addCart;
      if (cartId) {
        if (cartIds.includes(cartId)) cartIds = cartIds.filter((id) => id !== cartId);
        else cartIds.push(cartId);
        renderMissingItems();
      }
    });

    els.orderForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const payerId = els.orderPayer.value;
      const total = parseFloat(els.orderTotal.value);
      const fee = parseFloat(els.orderFee.value) || 0;
      const platform = els.orderPlatform.value;
      const grandTotal = total + fee;
      if (!RA.getRoommate(payerId) || !isSafeAmount(total)) {
        setDeliveryStatus("Enter a valid order total.", true);
        return;
      }

      const cartItems = RA.state.missingItems.filter((m) => cartIds.includes(m.id) && m.status === "open");
      if (!cartItems.length) {
        setDeliveryStatus("Add items to cart first.", true);
        return;
      }

      const culpritSet = new Set();
      cartItems.forEach((m) => m.culpritIds.forEach((id) => culpritSet.add(id)));
      let culpritIds = [...culpritSet];
      if (!culpritIds.length) {
        culpritIds = RA.state.roommates.filter((r) => r.id !== payerId).map((r) => r.id);
      }

      const itemNames = cartItems.map((m) => m.item).join(", ");
      const platformLabel = platform === "ubereats" ? "Uber Eats" : "DoorDash";

      RA.state.expenses.push({
        id: RA.uid(),
        payerId,
        amount: grandTotal,
        description: sanitizeText(`${platformLabel} restock: ${itemNames}`, LIMITS.maxTextLen),
        splitAmongIds: culpritIds,
      });

      cartItems.forEach((m) => {
        m.status = "charged";
      });

      RA.state.deliveryOrders.push({
        id: RA.uid(),
        platform,
        total: grandTotal,
        payerId,
        itemIds: cartItems.map((m) => m.id),
        culpritIds,
        at: new Date().toISOString(),
      });

      const charges = computeCulpritCharges(grandTotal, culpritIds, payerId);
      cartIds = [];
      els.orderTotal.value = "";
      els.orderFee.value = "";

      RA.saveState();
      RA.renderAll();
      renderChargePanel(charges, payerId);
      setDeliveryStatus(
        `Restock logged. ${culpritIds.length} culprit(s) split ${RA.formatMoney(grandTotal)} — balances updated.`
      );
      setTimeout(() => setDeliveryStatus(""), 5000);
    });

    els.chargePanel?.addEventListener("click", async (e) => {
      const zelle = e.target.dataset?.copyZelle;
      const amount = e.target.dataset?.amount;
      if (!zelle) return;
      try {
        await navigator.clipboard.writeText(zelle);
        e.target.textContent = "Copied Zelle info!";
        setTimeout(() => {
          e.target.textContent = `Copy Zelle · ${RA.formatMoney(parseFloat(amount))}`;
        }, 2000);
      } catch (_) {
        prompt("Copy this Zelle contact:", zelle);
      }
    });

    const origRenderAll = RA.renderAll;
    RA.renderAll = function () {
      origRenderAll();
      renderMissingSelectors();
      renderMissingItems();
      renderDeliveryHistory();
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDelivery);
  } else {
    initDelivery();
  }
})();
