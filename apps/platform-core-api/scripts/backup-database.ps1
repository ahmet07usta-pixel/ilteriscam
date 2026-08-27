# Backs up the Postgres database (via the running Docker container) to a timestamped
# .sql file under ./backups, and deletes backups older than $RetentionDays.
# Usage: powershell -File scripts/backup-database.ps1
param(
    [string]$ContainerName = "platform-core-postgres",
    [string]$DbUser = "postgres",
    [string]$DbName = "platform_core_test",
    [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupDir = Join-Path (Split-Path -Parent $scriptDir) "backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $backupDir "backup-$timestamp.sql"

Write-Host "Backing up '$DbName' from container '$ContainerName' to $backupFile ..."
docker exec $ContainerName pg_dump -U $DbUser -d $DbName | Out-File -FilePath $backupFile -Encoding utf8

if (-not (Test-Path $backupFile) -or (Get-Item $backupFile).Length -eq 0) {
    Write-Error "Backup failed or produced an empty file."
    exit 1
}

Write-Host "Backup OK: $backupFile ($((Get-Item $backupFile).Length) bytes)"

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $backupDir -Filter "backup-*.sql" | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
    Write-Host "Deleting old backup: $($_.Name)"
    Remove-Item $_.FullName -Force
}
