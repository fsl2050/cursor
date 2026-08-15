$ProjectRoot = Split-Path -Parent $PSScriptRoot
Remove-Item Env:XAI_API_KEY -ErrorAction SilentlyContinue
Get-Content (Join-Path $ProjectRoot ".env") | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item "env:$($matches[1].Trim())" $matches[2].Trim().Trim('"').Trim("'") }
}
try {
  $r = Invoke-WebRequest -Uri "https://api.x.ai/v1/models" -Headers @{ Authorization = "Bearer $env:XAI_API_KEY" } -UseBasicParsing
  "MODELS OK $($r.StatusCode)"
  ($r.Content | ConvertFrom-Json).data | Select-Object -First 8 -ExpandProperty id
} catch {
  "MODELS FAIL $([int]$_.Exception.Response.StatusCode)"
}
