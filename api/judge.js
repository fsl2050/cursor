/**
 * Vercel serverless handler for Grok judge API.
 */

const {
  securityHeaders,
  checkRateLimit,
  getClientIp,
  callGrokJudge,
  MAX_BODY,
} = require("../lib/guardrails-server");

module.exports = async function handler(req, res) {
  const headers = securityHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "XAI_API_KEY not configured on server" });
  }

  const bodySize = JSON.stringify(req.body || {}).length;
  if (bodySize > MAX_BODY) {
    return res.status(413).json({ error: "Request too large" });
  }

  try {
    const result = await callGrokJudge(req.body, apiKey, process.env.GROK_MODEL);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
