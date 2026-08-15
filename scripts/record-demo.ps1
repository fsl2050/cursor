# Browser-only demo recorder (CDP screenshots + Windows TTS + ffmpeg)
# Delegates to ship-demo.ps1 — never captures desktop/Cursor.
& (Join-Path (Split-Path $MyInvocation.MyCommand.Path) "ship-demo.ps1")
