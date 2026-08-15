# Tries multiple xAI endpoints/models until one works
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $ProjectRoot ".env"

Remove-Item Env:XAI_API_KEY, Env:GROK_MODEL -ErrorAction SilentlyContinue
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim().Trim('"').Trim("'")
  }
}

$apiKey = $env:XAI_API_KEY
if (-not $apiKey -or -not $apiKey.StartsWith("xai-")) {
  Write-Host "BAD KEY" -ForegroundColor Red
  exit 1
}

function Escape-Json([string]$s) {
  ($s -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", '\r' -replace "`n", '\n')
}

function Try-Chat($model) {
  $json = "{`"model`":`"$model`",`"messages`":[{`"role`":`"user`",`"content`":`"Say hi in JSON: {\\`"verdict\\`":\\`"ok\\`"}`"}],`"max_tokens`":64}"
  try {
    $r = Invoke-WebRequest -Uri "https://api.x.ai/v1/chat/completions" -Method Post `
      -Headers @{ Authorization = "Bearer $apiKey"; "Content-Type" = "application/json" } `
      -Body ([Text.Encoding]::UTF8.GetBytes($json)) -UseBasicParsing
    return @{ ok = $true; code = $r.StatusCode; body = $r.Content }
  } catch {
    $code = [int]$_.Exception.Response.StatusCode
    $body = ""
    try {
      $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
      $body = $sr.ReadToEnd()
    } catch {}
    return @{ ok = $false; code = $code; body = $body }
  }
}

function Try-Responses($model) {
  $json = "{`"model`":`"$model`",`"input`":[{`"role`":`"user`",`"content`":`"Say hi in JSON: {\\`"verdict\\`":\\`"ok\\`"}`"}]}"
  try {
    $r = Invoke-WebRequest -Uri "https://api.x.ai/v1/responses" -Method Post `
      -Headers @{ Authorization = "Bearer $apiKey"; "Content-Type" = "application/json" } `
      -Body ([Text.Encoding]::UTF8.GetBytes($json)) -UseBasicParsing
    return @{ ok = $true; code = $r.StatusCode; body = $r.Content }
  } catch {
    $code = [int]$_.Exception.Response.StatusCode
    $body = ""
    try {
      $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
      $body = $sr.ReadToEnd()
    } catch {}
    return @{ ok = $false; code = $code; body = $body }
  }
}

$models = @("grok-4.6", "grok-4.3", "grok-4.20-0309-non-reasoning", "grok-2-1212")
Write-Host "Probing xAI with key len $($apiKey.Length)..." -ForegroundColor Cyan

foreach ($m in $models) {
  $chat = Try-Chat $m
  if ($chat.ok) {
    Write-Host "CHAT OK: $m" -ForegroundColor Green
    Write-Host $chat.body
    Set-Content -Path (Join-Path $ProjectRoot ".grok-model") -Value $m -NoNewline
    exit 0
  }
  Write-Host "chat/$m -> $($chat.code) $($chat.body)" -ForegroundColor DarkYellow

  $resp = Try-Responses $m
  if ($resp.ok) {
    Write-Host "RESPONSES OK: $m" -ForegroundColor Green
    Write-Host $resp.body
    Set-Content -Path (Join-Path $ProjectRoot ".grok-model") -Value $m -NoNewline
    exit 0
  }
  Write-Host "responses/$m -> $($resp.code) $($resp.body)" -ForegroundColor DarkYellow
}

Write-Host "ALL FAILED - likely account billing/403 on xAI side" -ForegroundColor Red
exit 1
