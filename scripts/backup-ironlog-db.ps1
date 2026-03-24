param(
  [string]$DbPath = "C:\IRONLOG\api\db\ironlog.db",
  [string]$BackupRoot = "C:\INSPECTPRO\backups",
  [int]$KeepDays = 14
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DbPath)) {
  throw "Database file not found: $DbPath"
}

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dailyDir = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Force -Path $dailyDir | Out-Null

$dbDir = Split-Path -Parent $DbPath
$dbName = Split-Path -Leaf $DbPath
$baseName = [System.IO.Path]::GetFileNameWithoutExtension($dbName)

$sourceFiles = @(
  (Join-Path $dbDir "$baseName.db"),
  (Join-Path $dbDir "$baseName.db-wal"),
  (Join-Path $dbDir "$baseName.db-shm")
)

foreach ($f in $sourceFiles) {
  if (Test-Path $f) {
    Copy-Item -Path $f -Destination $dailyDir -Force
  }
}

$zipPath = Join-Path $BackupRoot ("ironlog-backup-{0}.zip" -f $stamp)
Compress-Archive -Path (Join-Path $dailyDir "*") -DestinationPath $zipPath -Force

Write-Host "Backup complete: $zipPath" -ForegroundColor Green

# Retention cleanup
$threshold = (Get-Date).AddDays(-[Math]::Abs($KeepDays))
Get-ChildItem -Path $BackupRoot -Filter "ironlog-backup-*.zip" -File |
  Where-Object { $_.LastWriteTime -lt $threshold } |
  Remove-Item -Force -ErrorAction SilentlyContinue

Get-ChildItem -Path $BackupRoot -Directory |
  Where-Object { $_.LastWriteTime -lt $threshold -and $_.Name -match '^\d{8}-\d{6}$' } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
