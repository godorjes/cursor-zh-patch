# Shared helpers for patch.ps1 and restore.ps1.
# Never prompts. Safe to dot-source from a non-interactive host.

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$Script:SupportedVersion = '3.27.22'

function Write-Out([string]$Message) {
    Write-Output $Message
}

function Test-CursorRunning {
    foreach ($name in @('Cursor', 'cursor')) {
        $found = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
        if ($found.Count -gt 0) {
            return $true
        }
    }
    return $false
}

function Test-DirectoryInside([string]$Parent, [string]$Child) {
    $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
    $childFull = [System.IO.Path]::GetFullPath($Child).TrimEnd('\', '/')
    if ($childFull.Equals($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }
    $separator = [System.IO.Path]::DirectorySeparatorChar
    return $childFull.StartsWith($parentFull + $separator, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-LayoutProblem([string]$InstallPath) {
    $product = Join-Path $InstallPath 'resources/app/product.json'
    if (Test-Path -LiteralPath $product) {
        return $null
    }
    $asar = Join-Path $InstallPath 'resources/app.asar'
    if (Test-Path -LiteralPath $asar) {
        return '安装布局无法识别：只发现 app.asar，没有已展开的 resources/app。'
    }
    return '安装布局无法识别：缺少 resources/app/product.json。'
}

function Test-ValidInstall([string]$InstallPath) {
    return $null -eq (Get-LayoutProblem $InstallPath)
}

function Test-WindowsHost {
    if ($PSVersionTable.PSVersion.Major -ge 6) {
        return [bool]$IsWindows
    }
    return $env:OS -eq 'Windows_NT'
}

function Find-CursorInstall {
    $candidates = [System.Collections.Generic.List[string]]::new()
    if ($env:LOCALAPPDATA) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\cursor')) | Out-Null
        $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\Cursor')) | Out-Null
        $candidates.Add((Join-Path $env:LOCALAPPDATA 'cursor')) | Out-Null
    }
    if ($env:ProgramFiles) {
        $candidates.Add((Join-Path $env:ProgramFiles 'Cursor')) | Out-Null
    }
    foreach ($drive in @('C', 'D', 'E', 'F')) {
        $candidates.Add("${drive}:\cursor\cursor") | Out-Null
        $candidates.Add("${drive}:\cursor") | Out-Null
    }
    if (Test-WindowsHost) {
        $keys = @(
            'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
        )
        foreach ($key in $keys) {
            $items = @(Get-ItemProperty -Path $key -ErrorAction SilentlyContinue)
            foreach ($item in $items) {
                $name = [string]$item.DisplayName
                if ($name -notmatch '^Cursor') { continue }
                if ($item.InstallLocation) { $candidates.Add([string]$item.InstallLocation) | Out-Null }
                if ($item.DisplayIcon) {
                    $icon = [string]$item.DisplayIcon
                    if ($icon -match '\.exe') {
                        $candidates.Add((Split-Path -Parent ($icon.Trim('"').Split(',')[0]))) | Out-Null
                    }
                }
            }
        }
        $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'Cursor.exe'" -ErrorAction SilentlyContinue)
        foreach ($proc in $procs) {
            if ($proc.ExecutablePath) {
                $candidates.Add((Split-Path -Parent $proc.ExecutablePath)) | Out-Null
            }
        }
    }
    foreach ($dir in $candidates) {
        if ($dir -and (Test-ValidInstall $dir)) {
            return [System.IO.Path]::GetFullPath($dir)
        }
    }
    return $null
}

function Get-ProductVersion([string]$InstallPath) {
    $productPath = Join-Path $InstallPath 'resources/app/product.json'
    $raw = [System.IO.File]::ReadAllText($productPath)
    $product = $raw | ConvertFrom-Json
    return [string]$product.version
}

function Get-NodeExecutable {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}
