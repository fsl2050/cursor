/**
 * Autoplay tour for screen recordings (?demo=1)
 * Resets state once, then walks through core flows over ~95s.
 */
(function () {
  const params = new URLSearchParams(location.search);
  if (!params.has("demo")) return;

  if (!params.has("reset")) {
    localStorage.removeItem("roommate-arbiter-v5");
    localStorage.removeItem("roommate-arbiter-checkin");
    localStorage.removeItem("roommate-arbiter-v4");
    localStorage.removeItem("roommate-arbiter-v3");
    params.set("reset", "1");
    location.replace(`${location.pathname}?${params}`);
    return;
  }

  document.title = "RA-DEMO-REC-ONLY";

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function scrollTo(sel) {
    document.querySelector(sel)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function typeInto(el, text, cps = 28) {
    if (!el) return;
    el.focus();
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    for (const ch of text) {
      el.value += ch;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(1000 / cps);
    }
  }

  function setVal(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function submit(id) {
    document.getElementById(id)?.requestSubmit();
  }

  function clickJoin(id) {
    document.querySelector(`[data-join-room="${id}"]`)?.click();
  }

  function clickMood(mood) {
    document.querySelector(`[data-mood="${mood}"]`)?.click();
  }

  async function sendChat(text) {
    const input = document.getElementById("chat-input");
    if (!input) return;
    await typeInto(input, text, 32);
    document.getElementById("chat-form")?.requestSubmit();
  }

  function badge() {
    const b = document.createElement("div");
    b.textContent = "DEMO";
    b.style.cssText =
      "position:fixed;top:12px;left:12px;z-index:9999;padding:6px 12px;border-radius:999px;" +
      "background:rgba(255,60,120,0.92);color:#fff;font:800 12px/1 system-ui;letter-spacing:0.12em;" +
      "box-shadow:0 4px 20px rgba(255,60,120,0.45);pointer-events:none;";
    document.body.appendChild(b);
  }

  async function runTour() {
    for (let i = 0; i < 80 && !window.RA; i++) await wait(50);
    if (!window.RA) return;

    badge();
    window.scrollTo({ top: 0, behavior: "smooth" });
    await wait(2500);

    const alexId = RA.addRoommate("Alex");
    await wait(1800);
    const jordanId = RA.addRoommate("Jordan");
    await wait(1800);

    RA.setCheckedInId(alexId);
    setVal(document.getElementById("checkin-select"), alexId);
    await wait(2000);

    scrollTo("#expenses-panel");
    await wait(1200);
    setVal(document.getElementById("expense-payer"), alexId);
    setVal(document.getElementById("expense-amount"), "42.50");
    await typeInto(document.getElementById("expense-desc"), "Costco apocalypse + emotional support snacks");
    await wait(800);
    submit("expense-form");
    await wait(2500);

    scrollTo("#meals-panel");
    await wait(1200);
    setVal(document.getElementById("meal-eater"), jordanId);
    setVal(document.getElementById("meal-share"), "0.75");
    await typeInto(document.getElementById("meal-item"), "Leftover pizza at 2am");
    await wait(600);
    submit("meal-form");
    await wait(2500);

    scrollTo("#gripes-panel");
    await wait(1200);
    setVal(document.getElementById("gripe-author"), jordanId);
    await typeInto(
      document.getElementById("gripe-text"),
      "Alex ate my labeled yogurt and said the label was 'suggestive'."
    );
    await wait(800);
    submit("gripe-form");
    await wait(2500);

    scrollTo("#delivery-panel");
    await wait(1200);
    await typeInto(document.getElementById("missing-item"), "Oat milk");
    setVal(document.getElementById("missing-qty"), "1");
    setVal(document.getElementById("missing-est"), "5.99");
    setVal(document.getElementById("missing-reporter"), jordanId);
    await wait(800);
    submit("missing-form");
    await wait(2500);

    scrollTo("#food-chat-sidebar");
    await wait(1200);

    RA.setCheckedInId(alexId);
    setVal(document.getElementById("chat-identity"), alexId);
    clickJoin(alexId);
    await wait(1200);
    clickMood("lazy");
    await wait(2000);

    RA.setCheckedInId(jordanId);
    setVal(document.getElementById("chat-identity"), jordanId);
    clickJoin(jordanId);
    await wait(1200);
    clickMood("spicy");
    await wait(2500);

    RA.setCheckedInId(alexId);
    setVal(document.getElementById("chat-identity"), alexId);
    await wait(800);
    await sendChat("Pizza or Thai tonight?");
    await wait(3500);

    RA.setCheckedInId(jordanId);
    setVal(document.getElementById("chat-identity"), jordanId);
    await wait(800);
    await sendChat("I'm down for whatever — surprise us CraveBot");
    await wait(3500);

    document.getElementById("suggest-btn")?.click();
    await wait(4500);

    scrollTo("#verdict-panel");
    await wait(1500);
    document.getElementById("judge-btn")?.click();
    await wait(5000);

    scrollTo("#verdict-output");
    await wait(4000);

    window.scrollTo({ top: 0, behavior: "smooth" });
    await wait(3000);
  }

  function startWhenReady() {
    const kick = () => {
      if (!window.RA?.addRoommate) {
        setTimeout(kick, 100);
        return;
      }
      setTimeout(runTour, 1500);
    };
    kick();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWhenReady);
  } else {
    startWhenReady();
  }
})();
