param(
  [string]$ConfigPath = "C:\INSPECTPRO\scripts\export-executive-mirror.config.json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ConfigPath)) {
  throw "Config not found: $ConfigPath. Copy export-executive-mirror.config.example.json and fill values."
}

node "C:\INSPECTPRO\scripts\export-executive-mirror.mjs" --config $ConfigPath
