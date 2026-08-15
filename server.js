/**
 * Local dev server — serves static files + Grok judge API.
 * Run: npm start (requires Node 18+)
 * Set XAI_API_KEY in .env
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  securityHeaders,
  checkRateLimit,
  getClientIp,
  callGrokJudge,
  callGrokFoodChat,
  MAX_BODY,
} = require("./lib/guardrails-server");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

loadEnv();

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

const STATIC_ALLOWLIST = new Set([
  "/",
  "/index.html",
  "/app.js",
  "/guardrails.js",
  "/delivery.js",
  "/food-chat.js",
  "/styles.css",
]);

function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  if (!STATIC_ALLOWLIST.has(urlPath)) {
    res.writeHead(404, securityHeaders());
    return res.end("Not found");
  }

  const filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath.slice(1));
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ROOT))) {
    res.writeHead(403, securityHeaders());
    return res.end("Forbidden");
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.writeHead(404, securityHeaders());
    return res.end("Not found");
  }
  const ext = path.extname(resolved);
  res.writeHead(200, { ...securityHeaders(), "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(resolved).pipe(res);
}

async function handleGrokPost(req, res, handler) {
  const headers = securityHeaders();
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    res.writeHead(429, { ...headers, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }));
  }

  let body = "";
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) {
      req.destroy();
      res.writeHead(413, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request too large" }));
      return;
    }
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) throw new Error("XAI_API_KEY not set on server");
      const payload = JSON.parse(body);
      const result = await handler(payload, apiKey, process.env.GROK_MODEL);
      res.writeHead(200, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

const server = http.createServer(async (req, res) => {
  const headers = securityHeaders();

  if (req.method === "POST" && req.url === "/api/judge") {
    return handleGrokPost(req, res, callGrokJudge);
  }

  if (req.method === "POST" && req.url === "/api/food-chat") {
    return handleGrokPost(req, res, callGrokFoodChat);
  }

  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405, headers);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Roommate Arbiter running at http://localhost:${PORT}`);
  console.log(process.env.XAI_API_KEY ? "Grok API: configured (server-side only)" : "Grok API: set XAI_API_KEY in .env");
  console.log("Guardrails: active — no shadow IT, allowlisted routes only");
});
