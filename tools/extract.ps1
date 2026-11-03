#Requires -Version 5.1
param(
    [string]$InstallPath,
    [string]$Out = ''
)
. (Join-Path $PSScriptRoot 'InstallCommon.ps1')
if (-not $InstallPath) { $InstallPath = Find-CursorInstall }
if (-not $InstallPath -or -not (Test-Path -LiteralPath $InstallPath)) {
    Write-Output "安装路径不存在: $InstallPath"
    exit 2
}
$node = Get-NodeExecutable
if (-not $node) { Write-Output '需要 Node.js。'; exit 1 }
$app = Join-Path $InstallPath 'resources/app'
$nodeArgs = @((Join-Path $PSScriptRoot 'extract.js'), '--app', $app)
if ($Out) { $nodeArgs += @('--out', $Out) }
& $node @nodeArgs
exit $(if ($LASTEXITCODE) { $LASTEXITCODE } else { 0 })
