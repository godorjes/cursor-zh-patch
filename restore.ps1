#Requires -Version 5.1
<#
.SYNOPSIS
  从 -BackupDir 还原 Cursor 安装目录中被补丁改过的文件。
#>
param(
    [string]$InstallPath,
    [string]$BackupDir
)

. (Join-Path $PSScriptRoot 'tools/InstallCommon.ps1')

if (-not $InstallPath) {
    $InstallPath = Find-CursorInstall
    if (-not $InstallPath) {
        Write-Out '未能自动定位 Cursor 安装目录。请传入 -InstallPath。'
        exit 1
    }
}

if (-not (Test-Path -LiteralPath $InstallPath)) {
    Write-Out "安装路径不存在: $InstallPath"
    exit 2
}

if (Test-CursorRunning) {
    Write-Out 'Cursor 正在运行。请先完全退出 Cursor 后再还原。'
    exit 4
}

$layout = Get-LayoutProblem $InstallPath
if ($layout) {
    Write-Out $layout
    exit 1
}

if (-not $BackupDir) {
    $versionForBackup = Get-ProductVersion $InstallPath
    $BackupDir = Join-Path $PSScriptRoot (Join-Path 'backups' $versionForBackup)
}

$manifest = Join-Path $BackupDir 'manifest.json'
if (-not (Test-Path -LiteralPath $manifest)) {
    Write-Out "找不到备份: $manifest"
    exit 1
}

$node = Get-NodeExecutable
if (-not $node) {
    Write-Out '需要 Node.js 18 或更高版本才能还原。'
    exit 1
}

$app = Join-Path $InstallPath 'resources/app'
& $node (Join-Path $PSScriptRoot 'tools/run-restore.js') --app $app --backup $BackupDir
if ($LASTEXITCODE -ne 0) {
    exit $(if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 })
}

$argvBackup = Join-Path $BackupDir 'argv.json'
$argvMeta = "$argvBackup.meta.json"
if (Test-Path -LiteralPath $argvMeta) {
    $meta = Get-Content -LiteralPath $argvMeta -Raw | ConvertFrom-Json
    $target = [string]$meta.path
    if ($target) {
        if ($meta.existed -and (Test-Path -LiteralPath $argvBackup)) {
            $parent = Split-Path -Parent $target
            if (-not (Test-Path -LiteralPath $parent)) {
                New-Item -ItemType Directory -Force -Path $parent | Out-Null
            }
            Copy-Item -LiteralPath $argvBackup -Destination $target -Force
        } elseif (-not $meta.existed -and (Test-Path -LiteralPath $target)) {
            Remove-Item -LiteralPath $target -Force
        }
    }
}

exit 0
