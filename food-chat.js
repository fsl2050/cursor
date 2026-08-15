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
