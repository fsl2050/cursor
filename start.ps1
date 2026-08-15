# Roommate Arbiter - Windows launcher (no Node required)
# Serves the app + Grok API proxy on http://localhost:3001

$ErrorActionPreference = "Stop"
$Port = if ($env:PORT) { [int]$env:PORT } else { 3001 }
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Load .env
$envFile = Join-Path $Root ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $val = $matches[2].Trim().Trim('"').Trim("'")
      Set-Item -Path "env:$($matches[1].Trim())" -Value $val
    }
  }
}

$GrokModel = if ($env:GROK_MODEL) { $env:GROK_MODEL } else { "grok-4.3" }

$StaticFiles = @{
  "/"              = "index.html"
  "/index.html"    = "index.html"
  "/app.js"        = "app.js"
  "/guardrails.js" = "guardrails.js"
  "/delivery.js"   = "delivery.js"
  "/food-chat.js"  = "food-chat.js"
  "/styles.css"    = "styles.css"
}

function Send-Response($ctx, $code, $body, $contentType = "text/plain") {
  $bytes = [Text.Encoding]::UTF8.GetBytes($body)
  $ctx.Response.StatusCode = $code
  $ctx.Response.ContentType = $contentType
  $ctx.Response.Headers.Add("X-Content-Type-Options", "nosniff")
  $ctx.Response.Headers.Add("X-Frame-Options", "DENY")
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

function Escape-Json([string]$s) {
  if ($null -eq $s) { return "" }
  ($s -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", '\r' -replace "`n", '\n' -replace "`t", '\t')
}

function Get-XaiErrorBody($ex) {
  try {
    if ($ex.Exception -and $ex.Exception.Response) {
      $stream = $ex.Exception.Response.GetResponseStream()
      $reader = New-Object IO.StreamReader($stream)
      $raw = $reader.ReadToEnd()
      if ($raw) {
        $parsed = $raw | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($parsed.error.message) { return $parsed.error.message }
        if ($parsed.message) { return $parsed.message }
        return $raw
      }
    }
  } catch {}
  return $ex.Exception.Message
}

function Call-Grok($payloadJson) {
  $apiKey = $env:XAI_API_KEY
  if (-not $apiKey -or $apiKey -eq "your_xai_api_key_here") {
    throw "XAI_API_KEY not set. Edit .env with your real key from https://console.x.ai/"
  }
  if (-not $apiKey.StartsWith("xai-")) {
    throw "Invalid XAI_API_KEY format. Must start with xai-"
  }

  $systemPrompt = "You are Grok, the Roommate Arbiter. Deliver a witty, fair 2-4 sentence verdict about roommate expenses and grievances. Never mention payment credentials. No harassment or slurs. Respond ONLY with valid JSON like: {`"verdict`":`"your ruling here`"}"

  $models = @($GrokModel, "grok-4.6", "grok-4.3", "grok-4.20-0309-non-reasoning") | Select-Object -Unique
  $lastErr = "unknown"

  foreach ($model in $models) {
    # Try chat completions
    $json = "{`"model`":`"$model`",`"messages`":[{`"role`":`"system`",`"content`":`"$(Escape-Json $systemPrompt)`"},{`"role`":`"user`",`"content`":`"$(Escape-Json $payloadJson)`"}],`"max_tokens`":512}"
    try {
      $resp = Invoke-WebRequest -Uri "https://api.x.ai/v1/chat/completions" -Method Post `
        -Headers @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $apiKey" } `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -UseBasicParsing
      $data = $resp.Content | ConvertFrom-Json
      $content = $data.choices[0].message.content
      if ($content -match '\{[\s\S]*\}') { return $Matches[0] }
    } catch {
      $lastErr = Get-XaiErrorBody $_
      if (-not $lastErr) { $lastErr = "HTTP $([int]$_.Exception.Response.StatusCode)" }
    }

    # Try responses API
    $rjson = "{`"model`":`"$model`",`"input`":[{`"role`":`"system`",`"content`":`"$(Escape-Json $systemPrompt)`"},{`"role`":`"user`",`"content`":`"$(Escape-Json $payloadJson)`"}]}"
    try {
      $resp = Invoke-WebRequest -Uri "https://api.x.ai/v1/responses" -Method Post `
        -Headers @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $apiKey" } `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($rjson)) -UseBasicParsing
      $data = $resp.Content | ConvertFrom-Json
      $content = $data.output[0].content[0].text
      if (-not $content) { $content = $data.output_text }
      if ($content -match '\{[\s\S]*\}') { return $Matches[0] }
    } catch {
      $lastErr = Get-XaiErrorBody $_
      if (-not $lastErr) { $lastErr = "HTTP $([int]$_.Exception.Response.StatusCode)" }
    }
  }

  if ($lastErr -match "403|Forbidden") {
    throw "xAI blocked request (403). Enable billing/credits at console.x.ai, then retry."
  }
  throw "xAI error: $lastErr"
}

function Call-FoodChat($payloadJson) {
  $apiKey = $env:XAI_API_KEY
  if (-not $apiKey -or $apiKey -eq "your_xai_api_key_here") {
    throw "XAI_API_KEY not set. Edit .env with your real key from https://console.x.ai/"
  }

  $systemPrompt = "You are CraveBot, a witty roommate food concierge. Suggest food based on moods and chat. Never mention payment info. Respond ONLY with valid JSON: {`"reply`":`"message`",`"suggestions`":[{`"name`":`"food`",`"vibe`":`"tag`"},{`"name`":`"...`",`"vibe`":`"...`"},{`"name`":`"...`",`"vibe`":`"...`"}]}"

  $models = @($GrokModel, "grok-4.6", "grok-4.3") | Select-Object -Unique
  $lastErr = "unknown"

  foreach ($model in $models) {
    $json = "{`"model`":`"$model`",`"messages`":[{`"role`":`"system`",`"content`":`"$(Escape-Json $systemPrompt)`"},{`"role`":`"user`",`"content`":`"$(Escape-Json $payloadJson)`"}],`"max_tokens`":512}"
    try {
      $resp = Invoke-WebRequest -Uri "https://api.x.ai/v1/chat/completions" -Method Post `
        -Headers @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $apiKey" } `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -UseBasicParsing
      $data = $resp.Content | ConvertFrom-Json
      $content = $data.choices[0].message.content
      if ($content -match '\{[\s\S]*\}') { return $Matches[0] }
    } catch {
      $lastErr = Get-XaiErrorBody $_
    }
  }
  throw "xAI error: $lastErr"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host ""
Write-Host "  Roommate Arbiter is running!" -ForegroundColor Green
Write-Host "  Open: http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  Grok model: $GrokModel" -ForegroundColor DarkGray
if ($env:XAI_API_KEY -and $env:XAI_API_KEY -ne "your_xai_api_key_here") {
  Write-Host "  Grok API: configured ($($env:XAI_API_KEY.Length) chars)" -ForegroundColor DarkGray
} else {
  Write-Host "  Grok API: MISSING - edit .env with your XAI_API_KEY" -ForegroundColor Yellow
}
Write-Host "  Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

Start-Process "http://localhost:$Port"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath
    $method = $ctx.Request.HttpMethod

    try {
      if ($method -eq "POST" -and $path -eq "/api/judge") {
        $reader = New-Object IO.StreamReader($ctx.Request.InputStream)
        $payloadJson = $reader.ReadToEnd()
        $reader.Close()
        if ($payloadJson.Length -gt 33000) { throw "Request too large" }
        $result = Call-Grok $payloadJson
        Send-Response $ctx 200 $result "application/json"
        continue
      }

      if ($method -eq "POST" -and $path -eq "/api/food-chat") {
        $reader = New-Object IO.StreamReader($ctx.Request.InputStream)
        $payloadJson = $reader.ReadToEnd()
        $reader.Close()
        if ($payloadJson.Length -gt 33000) { throw "Request too large" }
        $result = Call-FoodChat $payloadJson
        Send-Response $ctx 200 $result "application/json"
        continue
      }

      if ($method -eq "GET") {
        $rel = if ($StaticFiles.ContainsKey($path)) { $StaticFiles[$path] } else { $null }
        if (-not $rel) {
          Send-Response $ctx 404 "Not found"
          continue
        }
        $filePath = Join-Path $Root $rel
        if (-not (Test-Path $filePath)) {
          Send-Response $ctx 404 "Not found"
          continue
        }
        $ext = [IO.Path]::GetExtension($filePath)
        $mime = switch ($ext) {
          ".html" { "text/html" }
          ".css"  { "text/css" }
          ".js"   { "application/javascript" }
          default { "application/octet-stream" }
        }
        $content = [IO.File]::ReadAllText($filePath)
        Send-Response $ctx 200 $content $mime
        continue
      }

      Send-Response $ctx 405 "Method not allowed"
    } catch {
      $msg = if ($_.Exception) { $_.Exception.Message } else { "$_" }
      $err = @{ error = $msg } | ConvertTo-Json -Compress
      Send-Response $ctx 500 $err "application/json"
    }
  }
} finally {
  $listener.Stop()
}
