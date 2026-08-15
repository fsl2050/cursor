# Quick test - run: powershell -File scripts/test-grok.ps1
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $ProjectRoot ".env"

if (-not (Test-Path $envFile)) {
  Write-Host "ERROR: .env not found at $envFile" -ForegroundColor Red
  exit 1
}

# Clear stale env vars from parent shell
Remove-Item Env:XAI_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:GROK_MODEL -ErrorAction SilentlyContinue

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $val = $matches[2].Trim().Trim('"').Trim("'")
    Set-Item -Path "env:$($matches[1].Trim())" -Value $val
  }
}

$apiKey = $env:XAI_API_KEY
$model = if ($env:GROK_MODEL) { $env:GROK_MODEL } else { "grok-4.3" }

if (-not $apiKey -or $apiKey -eq "your_xai_api_key_here") {
  Write-Host "ERROR: Set XAI_API_KEY in .env first" -ForegroundColor Red
  exit 1
}

if (-not $apiKey.StartsWith("xai-")) {
  Write-Host "ERROR: Key must start with xai- (yours starts with: $($apiKey.Substring(0, [Math]::Min(4, $apiKey.Length))))" -ForegroundColor Red
  exit 1
}

function Escape-Json([string]$s) {
  if ($null -eq $s) { return "" }
  ($s -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", '\r' -replace "`n", '\n' -replace "`t", '\t')
}

$systemPrompt = 'You are Grok. Respond ONLY with JSON: {"verdict":"hello from grok"}'
$userPrompt = 'Test: Dave owes Alex $10 for pizza.'

$json = "{`"model`":`"$model`",`"messages`":[{`"role`":`"system`",`"content`":`"$(Escape-Json $systemPrompt)`"},{`"role`":`"user`",`"content`":`"$(Escape-Json $userPrompt)`"}],`"max_tokens`":256}"

Write-Host "Testing model: $model" -ForegroundColor Cyan
Write-Host "Key OK: starts with xai-, length $($apiKey.Length) chars" -ForegroundColor DarkGray

try {
  $resp = Invoke-WebRequest -Uri "https://api.x.ai/v1/chat/completions" -Method Post `
    -Headers @{ "Authorization" = "Bearer $apiKey"; "Content-Type" = "application/json" } `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) `
    -UseBasicParsing

  Write-Host "SUCCESS ($($resp.StatusCode))" -ForegroundColor Green
  Write-Host $resp.Content
} catch {
  Write-Host "FAILED" -ForegroundColor Red
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    Write-Host "Status: $code"
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $body = $reader.ReadToEnd()
      if ($body) { Write-Host "Body: $body" } else { Write-Host "Body: (empty)" }
    } catch { Write-Host "Body: (could not read)" }
    if ($code -eq 403) {
      Write-Host ""
      Write-Host "403 usually means:" -ForegroundColor Yellow
      Write-Host "  - xAI account needs billing/credits enabled at console.x.ai" -ForegroundColor Yellow
      Write-Host "  - API key lacks permission for this team" -ForegroundColor Yellow
      Write-Host "  - New key may take a minute to activate" -ForegroundColor Yellow
    }
  } else {
    Write-Host $_.Exception.Message
  }
  exit 1
}
