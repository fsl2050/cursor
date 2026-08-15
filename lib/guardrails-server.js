/**
 * Server-side guardrails — rate limits, validation, security headers.
 */

const {
  validateGrokPayload,
  validateFoodChatPayload,
  sanitizeVerdict,
  sanitizeFoodChatReply,
  GROK_SYSTEM_PROMPT,
  FOOD_CHAT_SYSTEM_PROMPT,
  LIMITS,
} = require("../guardrails");

const XAI_API = "https://api.x.ai/v1/chat/completions";
const DEFAULT_GROK_MODEL = "grok-4.3";
const MAX_BODY = LIMITS.maxPayloadBytes + 1024;

const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  };
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + RATE_WINDOW_MS;
  }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= RATE_MAX;
}

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "local";
}

async function callGrokJudge(payload, apiKey, model) {
  const err = validateGrokPayload(payload);
  if (err) throw new Error(err);

  const grokModel = model || process.env.GROK_MODEL || DEFAULT_GROK_MODEL;

  const res = await fetch(XAI_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: grokModel,
      messages: [
        { role: "system", content: GROK_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.85,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.message || detail;
    } catch (_) {}
    if (res.status === 401) throw new Error("Invalid XAI_API_KEY — check your .env file");
    if (res.status === 400 && /model/i.test(detail)) {
      throw new Error(`Bad model "${grokModel}": ${detail}. Try GROK_MODEL=grok-4.3 in .env`);
    }
    throw new Error(`xAI API error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Grok returned an unparseable verdict");

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Grok returned invalid JSON");
  }

  if (!parsed.verdict || typeof parsed.verdict !== "string") {
    throw new Error("Grok response missing verdict field");
  }

  return { verdict: sanitizeVerdict(parsed.verdict) };
}

async function callGrokFoodChat(payload, apiKey, model) {
  const err = validateFoodChatPayload(payload);
  if (err) throw new Error(err);

  const grokModel = model || process.env.GROK_MODEL || DEFAULT_GROK_MODEL;

  const res = await fetch(XAI_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: grokModel,
      messages: [
        { role: "system", content: FOOD_CHAT_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.9,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.message || detail;
    } catch (_) {}
    throw new Error(`xAI API error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("CraveBot returned an unparseable response");

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("CraveBot returned invalid JSON");
  }

  if (!parsed.reply || typeof parsed.reply !== "string") {
    throw new Error("CraveBot response missing reply field");
  }

  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.slice(0, 3).map((s) => ({
        name: String(s.name || "").slice(0, LIMITS.maxTextLen),
        vibe: String(s.vibe || "").slice(0, 80),
      }))
    : [];

  return { reply: sanitizeFoodChatReply(parsed.reply), suggestions };
}

module.exports = {
  securityHeaders,
  checkRateLimit,
  getClientIp,
  callGrokJudge,
  callGrokFoodChat,
  MAX_BODY,
  XAI_API,
};
