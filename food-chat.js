/**
 * CraveBot — mood-based group food chat sidebar
 * Presence check-in, collective mood, suggestions, order placement
 */
(function () {
  const MOODS = [
    { id: "lazy", emoji: "😴", label: "Lazy", tags: ["pizza", "burgers", "ramen"] },
    { id: "spicy", emoji: "🌶️", label: "Spicy", tags: ["thai", "hot chicken", "curry"] },
    { id: "broke", emoji: "💸", label: "Broke", tags: ["tacos", "pizza deals", "fried rice"] },
    { id: "party", emoji: "🎉", label: "Party", tags: ["wings", "sushi platter", "nachos"] },
    { id: "healthy", emoji: "🥗", label: "Healthy", tags: ["salad bowl", "poke", "grain bowl"] },
    { id: "sad", emoji: "😢", label: "Sad", tags: ["mac and cheese", "soup", "ice cream"] },
    { id: "adventurous", emoji: "🌍", label: "Adventurous", tags: ["ethiopian", "korean bbq", "dim sum"] },
    { id: "comfort", emoji: "🛋️", label: "Comfort", tags: ["meatloaf", "mashed potatoes", "grilled cheese"] },
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
    closeBtn: document.getElementById("chat-close"),
    presenceList: document.getElementById("presence-list"),
    quorumBadge: document.getElementById("quorum-badge"),
    moodPicker: document.getElementById("mood-picker"),
    messages: document.getElementById("chat-messages"),
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
    const tops = dominantMoods().map((m) => getMood(m)?.label).filter(Boolean);
    const vibe = tops.length ? tops.join(" + ") : "mystery";
    const lower = userText.toLowerCase();
    if (/cheap|broke|budget|afford/.test(lower)) {
      return `Broke mode activated. With ${vibe} vibes in the room, I'd hunt deals — tacos, pizza promos, or fried rice. Vote below or say "surprise me" again.`;
    }
    if (/healthy|salad|light|diet/.test(lower)) {
      return `Health-conscious crew? Bold of you. Bowls, poke, or grilled options incoming — still compatible with ${vibe} energy.`;
    }
    if (/spicy|hot|heat/.test(lower)) {
      return `Turning up the heat for this ${vibe} squad. Thai, hot chicken, or curry could settle the debate.`;
    }
    if (/surprise|pick|decide|idk|don't know/.test(lower)) {
      return `Reading the room: ${vibe} energy detected. I pulled 3 options — vote as a democracy or fight about it.`;
    }
    if (isQuorum()) {
      return `Full house! Collective mood is ${vibe}. Check the suggestions — majority vote wins, then smash Order.`;
    }
    return `Noted: "${sanitizeText(userText, 60)}". Current vibe mix: ${vibe}. Need everyone in the room + moods for the official group order.`;
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
    const moodLabels = dominantMoods().map((m) => getMood(m)?.emoji + " " + getMood(m)?.label);
    if (isQuorum()) {
      return `🎉 Quorum reached! ${names.join(", ")} are all here. Mood board: ${moodLabels.join(", ") || "undecided"}. Here are 3 group picks — vote, then order!`;
    }
    return `Hangout update: ${names.length} in the room. Moods: ${moodLabels.join(", ") || "pick one!"}. Suggestions when you're ready:`;
  }

  function renderPresence() {
    if (!els.presenceList || !ensureHangout()) return;
    const you = RA.getCheckedInId();

    if (!RA.state.roommates.length) {
      els.presenceList.innerHTML = `<p class="entry-meta">Add roommates first.</p>`;
      return;
    }

    els.presenceList.innerHTML = RA.state.roommates
      .map((r) => {
        const present = RA.state.hangout.presentIds.includes(r.id);
        const mood = RA.state.hangout.moods[r.id];
        const moodLabel = mood ? getMood(mood)?.emoji : "";
        const isYou = r.id === you;
        const toggleBtn = isYou
          ? present
            ? `<button type="button" class="btn btn-sm btn-ghost" data-leave-room="${r.id}">Leave room</button>`
            : `<button type="button" class="btn btn-sm btn-sky" data-join-room="${r.id}">I'm in the room</button>`
          : "";
        return `
        <div class="presence-row ${present ? "present" : ""}">
          <span class="presence-dot" aria-hidden="true"></span>
          <span class="presence-name">${RA.escapeHtml(r.name)}${isYou ? " (you)" : ""}</span>
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
        els.quorumBadge.textContent = `✓ All ${n} roommates present — ready to order!`;
      } else {
        els.quorumBadge.className = "quorum-badge quorum-no";
        els.quorumBadge.textContent = `${p}/${n} in the room${n < 2 ? " (need 2+ roommates)" : ""}`;
      }
    }
  }

  function renderMoodPicker() {
    if (!els.moodPicker) return;
    const you = RA.getCheckedInId();
    const present = you && RA.state.hangout.presentIds.includes(you);
    const yourMood = you ? RA.state.hangout.moods[you] : "";

    if (!present) {
      els.moodPicker.innerHTML = `<p class="entry-meta">Check in to the room to set your mood.</p>`;
      return;
    }

    els.moodPicker.innerHTML = `
      <p class="mood-label">Your vibe today</p>
      <div class="mood-grid">
        ${MOODS.map(
          (m) => `
          <button type="button" class="mood-chip ${yourMood === m.id ? "active" : ""}" data-mood="${m.id}">
            ${m.emoji} ${m.label}
          </button>`
        ).join("")}
      </div>`;
  }

  function renderMessages() {
    if (!els.messages) return;
    els.messages.innerHTML = RA.state.hangout.messages
      .map((m) => {
        const author =
          m.role === "bot"
            ? "🤖 CraveBot"
            : RA.escapeHtml(RA.getRoommate(m.authorId)?.name || "Roommate");
        return `
        <div class="chat-bubble ${m.role}">
          <span class="chat-author">${author}</span>
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
      els.suggestions.innerHTML = `<p class="entry-meta">Ask CraveBot or hit "Get suggestions" when moods are set.</p>`;
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
    renderPresence();
    renderMoodPicker();
    renderMessages();
    renderSuggestions();

    const canSuggest = RA.state.hangout.presentIds.length >= 1 && allPresentHaveMoods();
    if (els.suggestBtn) els.suggestBtn.disabled = !canSuggest || thinking;
    if (els.chatInput) els.chatInput.disabled = thinking;
  }

  function initFoodChat() {
    if (!ensureHangout()) {
      setTimeout(initFoodChat, 50);
      return;
    }

    if (!RA.state.hangout.messages.length) {
      addMessage("bot", "Hey roomies! 👋 Pick yourself in the header, check in to the room, set your mood, and I'll help you agree on food.");
      RA.saveState();
    }

    renderChat();

    els.toggle?.addEventListener("click", () => {
      els.sidebar?.classList.toggle("open");
    });
    els.closeBtn?.addEventListener("click", () => {
      els.sidebar?.classList.remove("open");
    });

    els.presenceList?.addEventListener("click", (e) => {
      const join = e.target.dataset.joinRoom;
      const leave = e.target.dataset.leaveRoom;
      const you = RA.getCheckedInId();
      if (join && join === you) {
        if (!RA.state.hangout.presentIds.includes(you)) {
          RA.state.hangout.presentIds.push(you);
          addMessage("user", "I'm in the room! 🏠", you);
          addMessage("bot", `Welcome ${RA.getRoommate(you)?.name}! Set your mood so I know what you're craving.`);
          RA.saveState();
          renderChat();
        }
      }
      if (leave && leave === you) {
        RA.state.hangout.presentIds = RA.state.hangout.presentIds.filter((id) => id !== you);
        delete RA.state.hangout.moods[you];
        addMessage("user", "Stepping out for a bit.", you);
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
      addMessage("user", `Feeling ${m?.label} ${m?.emoji}`, you);
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
        setChatStatus("Pick who's you in the header first.", true);
        return;
      }
      if (!RA.state.hangout.presentIds.includes(you)) {
        setChatStatus("Check in to the room first.", true);
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
      if (target) target.votes.push(you);
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

      addMessage("bot", `Order logged: ${picked.name} for ${RA.formatMoney(grandTotal)} split ${presentIds.length} ways. Bon appétit! 🍽️`);
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
      addMessage("bot", "Fresh hangout started. Check in when you're back in the room!");
      RA.saveState();
      renderChat();
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
