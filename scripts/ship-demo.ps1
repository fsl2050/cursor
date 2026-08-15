# Browser-only demo: CDP capture.exe + Windows TTS + ffmpeg
$ErrorActionPreference = "Stop"
$Root = "C:\Users\fsl20\cursor"
$OutDir = Join-Path $Root "demo-video"
$FramesDir = Join-Path $OutDir "frames"
$OutFile = Join-Path $OutDir "roommate-arbiter-demo.mp4"
$AudioFile = Join-Path $OutDir "narration.wav"
$VideoOnly = Join-Path $OutDir "video-only.mp4"
$DebugPort = 9333
$FrameIntervalSec = 2
$CaptureSeconds = 92
$FrameCount = [math]::Ceiling($CaptureSeconds / $FrameIntervalSec)
$CaptureExe = Join-Path $Root "scripts\capture.exe"

New-Item -ItemType Directory -Force -Path $OutDir, $FramesDir | Out-Null
Get-ChildItem $FramesDir -Filter "frame_*.jpg" | Remove-Item -Force -EA SilentlyContinue

$ffmpeg = Get-ChildItem (Join-Path $Root "tools") -Recurse -Filter ffmpeg.exe | Select-Object -First 1 -ExpandProperty FullName
$ffprobe = Join-Path (Split-Path $ffmpeg) "ffprobe.exe"
$csc = "${env:WINDIR}\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $CaptureExe) -or (Get-Item $CaptureExe).Length -lt 1000) {
  if (Test-Path $CaptureExe) { Remove-Item $CaptureExe -Force }
  & $csc /nologo /out:$CaptureExe (Join-Path $Root "scripts\capture.cs")
  if (-not (Test-Path $CaptureExe)) { throw "capture.exe build failed" }
}

$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

Add-Type -AssemblyName System.Speech
$narration = @"
Welcome to Roommate Arbiter, Grok's petty crimes division for shared kitchens.
The Roomie Roster: add your humans, pick who's you, and save payment links for when justice arrives.
Receipts and Regrets logs who swiped the card and how much chaos they bought.
Snacc Confessions is where roommates admit what vanished from the fridge. Grok already knows.
The Grievance Box is official bitching. Every word goes to the judge.
Restock Express tracks what's gone and charges the culprits after you reorder.
CraveBot handles group food picks. Mark who's home, set moods, chat, and get suggestions.
Summon the Arbiter. Grok roasts everyone and sends you to Venmo jail. Court adjourned.
"@
Write-Host "TTS..."
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 1
$synth.SetOutputToWaveFile($AudioFile)
$synth.Speak($narration)
$synth.Dispose()

$profile = Join-Path $env:TEMP "ra-cdp-profile"
Get-CimInstance Win32_Process -EA SilentlyContinue | Where-Object { $_.CommandLine -like "*ra-cdp-profile*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }
if (Test-Path $profile) { Remove-Item $profile -Recurse -Force -EA SilentlyContinue }

$url = "http://localhost:3001/?demo=1&reset=1&v=15"
$launch = @("--remote-debugging-port=$DebugPort","--user-data-dir=$profile","--window-size=1280,720","--no-first-run",$url)
Write-Host "Launch browser..."
Start-Process -FilePath $browser -ArgumentList $launch -WindowStyle Hidden | Out-Null
Start-Sleep -Seconds 5

$targets = Invoke-RestMethod -Uri "http://127.0.0.1:${DebugPort}/json/list"
$wsUrl = ($targets | Where-Object { $_.type -eq "page" -and $_.url -like "*localhost:3001*" } | Select-Object -First 1).webSocketDebuggerUrl
if (-not $wsUrl) { $wsUrl = ($targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1).webSocketDebuggerUrl }

Write-Host "CDP capture $FrameCount frames..."
& $CaptureExe $wsUrl $FramesDir $FrameCount ($FrameIntervalSec * 1000)

Get-CimInstance Win32_Process -EA SilentlyContinue | Where-Object { $_.CommandLine -like "*ra-cdp-profile*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }

$fps = 1.0 / $FrameIntervalSec
& $ffmpeg -y -framerate $fps -i (Join-Path $FramesDir "frame_%04d.jpg") -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p $VideoOnly
if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
& $ffmpeg -y -i $VideoOnly -i $AudioFile -c:v copy -c:a aac -b:a 96k -shortest $OutFile

$info = Get-Item $OutFile
$dur = & $ffprobe -v error -show_entries format=duration -of csv=p=0 $OutFile
Write-Host "DONE: $($info.FullName) $([math]::Round($info.Length/1MB,2))MB ${dur}s"
