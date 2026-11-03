#Requires -Version 5.1
<#
.SYNOPSIS
  给已展开的 Cursor 安装目录打简体中文补丁。

.PARAMETER InstallPath
  安装根目录，内有 Cursor.exe 与 resources/app。省略时尝试自动查找。

.PARAMETER BackupDir
  干净备份的目录，必须在安装根之外。省略时使用脚本旁的 backups\<版本>。
#>
param(
    [string]$InstallPath,
    [string]$BackupDir,
    [switch]$SetLocale,
    [switch]$InstallLanguagePack
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
    Write-Out 'Cursor 正在运行。请先完全退出 Cursor 后再打补丁。'
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
if (Test-DirectoryInside $InstallPath $BackupDir) {
    Write-Out "备份目录不能位于安装目录内: $BackupDir"
    exit 1
}

$node = Get-NodeExecutable
if (-not $node) {
    Write-Out '需要 Node.js 18 或更高版本才能替换字符串并做语法检查。'
    exit 1
}

$version = Get-ProductVersion $InstallPath
if ($version -ne $Script:SupportedVersion) {
    Write-Out "警告: 检测到版本 $version，受支持版本为 $($Script:SupportedVersion)。将继续打补丁。"
}

$app = Join-Path $InstallPath 'resources/app'
$map = Join-Path $PSScriptRoot 'i18n/zh-CN.json'
$exclude = Join-Path $PSScriptRoot 'i18n/exclude.json'
& $node (Join-Path $PSScriptRoot 'tools/run-patch.js') `
    --app $app `
    --backup $BackupDir `
    --map $map `
    --exclude $exclude
if ($LASTEXITCODE -ne 0) {
    exit $(if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 })
}

if ($SetLocale) {
    $argv = Join-Path $env:USERPROFILE '.cursor/argv.json'
    & $node (Join-Path $PSScriptRoot 'tools/set-locale.js') --file $argv --locale zh-cn --backup (Join-Path $BackupDir 'argv.json')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($InstallLanguagePack) {
    $extensions = Join-Path $env:USERPROFILE '.cursor/extensions'
    $userData = if (Test-WindowsHost) { Join-Path $env:APPDATA 'Cursor' } else { Join-Path $env:HOME '.config/Cursor' }
    & $node (Join-Path $PSScriptRoot 'tools/install-languagepack.js') --extensions-dir $extensions --user-data $userData
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $clp = Join-Path $userData 'clp'
    if (Test-Path -LiteralPath $clp) {
        Remove-Item -LiteralPath $clp -Recurse -Force
    }
}

exit 0
