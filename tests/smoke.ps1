#!/usr/bin/env pwsh
#Requires -Version 7.0
<#
.SYNOPSIS
    在临时假安装目录上冒烟检查 patch.ps1 / restore.ps1。

.DESCRIPTION
    被测脚本缺失时报告「被测脚本缺失」并以退出码 2 结束。
    该结果不是通过，日志里不会写 SMOKE_STATUS=PASSED。
    与补丁脚本对齐时，只改下面的「接口契约」段。
#>
param(
    [string]$PatchScript,
    [string]$RestoreScript,
    [string]$WorkRoot,
    [switch]$KeepWorkRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {
}

# ############################################################
# 接口契约 — 与 patch.ps1 / restore.ps1 对齐时只改这一段
# ############################################################
$Script:Contract = @{
    PatchScriptName        = 'patch.ps1'
    RestoreScriptName      = 'restore.ps1'
    InstallPathParameter   = 'InstallPath'
    BackupDirParameter     = 'BackupDir'
    SupportedVersion       = '3.27.22'
    MismatchVersion        = '9.9.9'
    ProductJsonRelative    = 'resources/app/product.json'
    OutRelative            = 'resources/app/out'
    ForbiddenInstallPaths  = @('F:\cursor\cursor', 'F:/cursor/cursor')
    InvokeTimeoutSeconds   = 120
    ProductNameShort       = 'Cursor'
    ProductNameLong        = 'Cursor'
    ApplicationName        = 'cursor'
    DataFolderName         = '.cursor'
    Win32MutexName         = 'cursor'
    Quality                = 'stable'
    # 40 字符的夹具提交号，打补丁后必须保持不变。
    ProductCommit          = 'smoke00000000000000000000000000000000000'
    # 带引号的原文整段替换。译法以 docs/glossary.md 为准：Agent 保留英文。
    # 更长的原文写在前面；实现按整段字面量替换，不依赖子串顺序。
    Replacements           = @(
        @{ Path = 'resources/app/out/nls.messages.json'; From = '"Cursor Settings"'; To = '"Cursor 设置"' }
        @{ Path = 'resources/app/out/vs/workbench/workbench.glass.main.js'; From = '"New Agent"'; To = '"新建 Agent"' }
        @{ Path = 'resources/app/out/vs/workbench/workbench.desktop.main.js'; From = '"New Chat"'; To = '"新聊天"' }
        @{ Path = 'resources/app/out/nls.messages.json'; From = '"Settings"'; To = '"设置"' }
        @{ Path = 'resources/app/out/vs/workbench/workbench.desktop.main.js'; From = '"Settings"'; To = '"设置"' }
        @{ Path = 'resources/app/out/vs/workbench/workbench.desktop.main.js'; From = '"Chat"'; To = '"聊天"' }
    )
    Preserved              = @(
        @{ Path = 'resources/app/out/nls.messages.json'; Text = '"Keep This English Label"' }
        @{ Path = 'resources/app/out/vs/workbench/api/node/extensionHostProcess.js'; Text = '"Reload Window"' }
        @{ Path = 'resources/app/out/vs/workbench/workbench.glass.main.js'; Text = '"Agent"' }
        @{ Path = 'resources/app/out/vs/workbench/contrib/composer/browser/preload-webview-browser.js'; Text = '"Agent"' }
    )
    TextExtensions         = @('.js', '.json', '.css')
}
# ############################################################

$Script:RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Script:Passes = 0
$Script:Failures = [System.Collections.Generic.List[string]]::new()

function Write-Line([string]$Message) {
    Write-Host $Message
}

function Add-Result([bool]$Ok, [string]$Message) {
    if ($Ok) {
        $Script:Passes++
        Write-Line "[PASS] $Message"
    } else {
        $Script:Failures.Add($Message) | Out-Null
        Write-Line "[FAIL] $Message"
    }
}

function Convert-PathKey([string]$Path) {
    return ($Path.Replace('\', '/').TrimEnd('/')).ToLowerInvariant()
}

function Test-IsForbiddenPath([string]$Path) {
    $candidates = [System.Collections.Generic.List[string]]::new()
    $candidates.Add((Convert-PathKey $Path)) | Out-Null
    try {
        $full = Convert-PathKey ([System.IO.Path]::GetFullPath($Path))
        if (-not $candidates.Contains($full)) {
            $candidates.Add($full) | Out-Null
        }
    } catch {
    }
    foreach ($banned in $Script:Contract.ForbiddenInstallPaths) {
        $key = Convert-PathKey ([string]$banned)
        foreach ($candidate in $candidates) {
            if ($candidate -eq $key -or $candidate.StartsWith($key + '/') -or $key.StartsWith($candidate + '/')) {
                return $true
            }
        }
    }
    return $false
}

function Test-IsInside([string]$Parent, [string]$Child) {
    $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
    $childFull = [System.IO.Path]::GetFullPath($Child).TrimEnd('\', '/')
    $separator = [System.IO.Path]::DirectorySeparatorChar
    if ($childFull.Equals($parentFull, [StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }
    return $childFull.StartsWith($parentFull + $separator, [StringComparison]::OrdinalIgnoreCase)
}

function Join-Under([string]$Root, [string]$Relative) {
    $path = $Root
    foreach ($part in ($Relative -split '[\\/]+')) {
        if ($part) {
            $path = Join-Path $path $part
        }
    }
    return $path
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Read-Utf8Strict([string]$Path) {
    $encoding = [System.Text.UTF8Encoding]::new($false, $true)
    return [System.IO.File]::ReadAllText($Path, $encoding)
}

function Get-CursorChecksum([string]$FilePath) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($FilePath)
    try {
        $hash = $sha.ComputeHash($stream)
    } finally {
        $stream.Dispose()
        $sha.Dispose()
    }
    return ([Convert]::ToBase64String($hash)).TrimEnd('=')
}

function Get-JsonField($Object, [string]$Name) {
    if ($null -eq $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return [string]$property.Value
}

function Get-InstallSnapshot([string]$Root) {
    $map = @{}
    $rootFull = [System.IO.Path]::GetFullPath($Root)
    $files = @(Get-ChildItem -LiteralPath $rootFull -Recurse -File -Force | Sort-Object FullName)
    foreach ($file in $files) {
        $relative = [System.IO.Path]::GetRelativePath($rootFull, $file.FullName).Replace('\', '/')
        $map[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
    }
    return $map
}

function Compare-Snapshot($Before, $After) {
    $diffs = [System.Collections.Generic.List[string]]::new()
    $keys = @($Before.Keys) + @($After.Keys) | Sort-Object -Unique
    foreach ($key in $keys) {
        $inBefore = $Before.ContainsKey($key)
        $inAfter = $After.ContainsKey($key)
        if ($inBefore -and -not $inAfter) {
            $diffs.Add("REMOVED $key") | Out-Null
        } elseif ($inAfter -and -not $inBefore) {
            $diffs.Add("ADDED $key") | Out-Null
        } elseif ($Before[$key] -ne $After[$key]) {
            $diffs.Add("CHANGED $key") | Out-Null
        }
    }
    return ,$diffs
}

function Write-Diffs($Diffs) {
    $shown = 0
    foreach ($diff in $Diffs) {
        Write-Line "    $diff"
        $shown++
        if ($shown -ge 30) {
            break
        }
    }
    $total = @($Diffs).Count
    if ($total -gt 30) {
        Write-Line "    ... $($total - 30) more"
    }
}

function Get-BackupFiles([string]$Backup) {
    if (-not (Test-Path -LiteralPath $Backup)) {
        return @()
    }
    return @(Get-ChildItem -LiteralPath $Backup -Recurse -File -Force)
}

function Get-CombinedOutput($Result) {
    return (($Result.Stdout + "`n" + $Result.Stderr).Trim())
}

function Write-ChildOutput($Result) {
    $text = Get-CombinedOutput $Result
    if ($text.Length -gt 4000) {
        $text = $text.Substring(0, 4000) + "`n...(truncated)"
    }
    if ($text) {
        Write-Line $text
    }
}

function Get-PwshPath {
    $command = Get-Command pwsh -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    return [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
}

function Get-ContractArguments([string]$InstallPath, [string]$BackupDir) {
    # 传给 patch.ps1 / restore.ps1 的参数只在这里组装。
    return @(
        "-$($Script:Contract.InstallPathParameter)", $InstallPath,
        "-$($Script:Contract.BackupDirParameter)", $BackupDir
    )
}

function Invoke-UnderTest([string]$ScriptPath, [string]$InstallPath, [string]$BackupDir) {
    $pwshPath = Get-PwshPath
    $tail = @(Get-ContractArguments -InstallPath $InstallPath -BackupDir $BackupDir)
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $pwshPath
    $startInfo.WorkingDirectory = $Script:RepoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    $startInfo.StandardOutputEncoding = $utf8
    $startInfo.StandardErrorEncoding = $utf8
    [void]$startInfo.ArgumentList.Add('-NoProfile')
    [void]$startInfo.ArgumentList.Add('-NonInteractive')
    [void]$startInfo.ArgumentList.Add('-File')
    [void]$startInfo.ArgumentList.Add($ScriptPath)
    foreach ($argument in $tail) {
        [void]$startInfo.ArgumentList.Add($argument)
    }

    Write-Line ("调用: pwsh -NoProfile -NonInteractive -File {0} {1}" -f $ScriptPath, ($tail -join ' '))
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $timeoutMs = [int]$Script:Contract.InvokeTimeoutSeconds * 1000
    if (-not $process.WaitForExit($timeoutMs)) {
        try { $process.Kill() } catch { }
        [void]$process.WaitForExit()
        $stdout = ''
        $stderr = "超时 ${timeoutMs}ms，脚本可能在等待交互输入"
        try { $stdout = $stdoutTask.Result } catch { }
        try { $stderr = ($stderrTask.Result + $stderr) } catch { }
        return [pscustomobject]@{ ExitCode = 124; Stdout = $stdout; Stderr = $stderr; TimedOut = $true }
    }
    [void]$process.WaitForExit()
    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Stdout   = $stdoutTask.Result
        Stderr   = $stderrTask.Result
        TimedOut = $false
    }
}

function Get-FixtureText {
    $mainJs = "/* smoke-structure */`n`"use strict`";`nfunction bootstrap() { return 0; }`n"
    $preloadJs = "/* smoke-structure */`n`"use strict`";`nfunction preload() { return 0; }`n"
    $sandboxJs = "/* smoke-structure */`n`"use strict`";`nfunction workbench() { return 0; }`n"
    $css = "/* smoke-structure */`n.monaco-workbench { color: #cccccc; }`n"
    $desktopJs = "/* smoke-structure */`n`"use strict`";`nconst desktopLabels = [`"New Chat`", `"Chat`", `"Settings`"];`n"
    $glassJs = "/* smoke-structure */`n`"use strict`";`nconst glassLabels = [`"Agent`", `"New Agent`"];`n"
    $composerJs = "/* smoke-structure */`n`"use strict`";`nconst composerLabel = `"Agent`";`n"
    $extensionHostJs = "/* smoke-structure */`n`"use strict`";`nconst command = `"Reload Window`";`n"
    $nlsMessages = "[`n  `"Settings`",`n  `"Cursor Settings`",`n  `"Keep This English Label`"`n]`n"
    $nlsKeys = "[`n  `"quality`",`n  `"version`"`n]`n"
    $packageJson = "{`n  `"name`": `"Cursor`",`n  `"version`": `"$($Script:Contract.SupportedVersion)`",`n  `"private`": true`n}`n"
    return [ordered]@{
        'resources/app/package.json'                                                                              = $packageJson
        'resources/app/out/main.js'                                                                               = $mainJs
        'resources/app/out/nls.keys.json'                                                                         = $nlsKeys
        'resources/app/out/nls.messages.json'                                                                     = $nlsMessages
        'resources/app/out/vs/base/parts/sandbox/electron-sandbox/preload.js'                                     = $preloadJs
        'resources/app/out/vs/code/electron-sandbox/workbench/workbench.js'                                       = $sandboxJs
        'resources/app/out/vs/workbench/workbench.desktop.main.css'                                               = $css
        'resources/app/out/vs/workbench/workbench.desktop.main.js'                                                = $desktopJs
        'resources/app/out/vs/workbench/workbench.glass.main.js'                                                  = $glassJs
        'resources/app/out/vs/workbench/api/node/extensionHostProcess.js'                                         = $extensionHostJs
        'resources/app/out/vs/workbench/contrib/composer/browser/preload-webview-browser.js'                      = $composerJs
    }
}

function Get-FixtureBinary {
    $exe = [System.Text.Encoding]::ASCII.GetBytes("MZ`nCURSOR_EXE_STUB`n")
    $pakUs = [byte[]](0x50, 0x41, 0x4B, 0x00, 0x01, 0x02, 0xFF)
    $pakGb = [byte[]](0x50, 0x41, 0x4B, 0x00, 0x01, 0x02, 0xFE)
    return [ordered]@{
        'Cursor.exe'         = $exe
        'locales/en-US.pak'  = $pakUs
        'locales/en-GB.pak'  = $pakGb
    }
}

function Get-AllFixturePaths($TextMap, $BinaryMap) {
    $paths = [System.Collections.Generic.List[string]]::new()
    foreach ($key in $TextMap.Keys) { $paths.Add($key) | Out-Null }
    foreach ($key in $BinaryMap.Keys) { $paths.Add($key) | Out-Null }
    $paths.Add($Script:Contract.ProductJsonRelative) | Out-Null
    return $paths
}

function Get-MustChangeSet {
    $set = @{}
    foreach ($item in $Script:Contract.Replacements) {
        $set[$item.Path] = $true
    }
    $set[$Script:Contract.ProductJsonRelative] = $true
    return $set
}

function Write-ProductJson([string]$InstallRoot) {
    $outRoot = Join-Under $InstallRoot $Script:Contract.OutRelative
    $keys = @(
        Get-AllFixturePaths (Get-FixtureText) (Get-FixtureBinary) |
            Where-Object { $_.StartsWith($Script:Contract.OutRelative + '/') } |
            ForEach-Object { $_.Substring($Script:Contract.OutRelative.Length + 1) } |
            Sort-Object
    )
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add('{') | Out-Null
    $lines.Add(('  "nameShort": "{0}",' -f $Script:Contract.ProductNameShort)) | Out-Null
    $lines.Add(('  "nameLong": "{0}",' -f $Script:Contract.ProductNameLong)) | Out-Null
    $lines.Add(('  "applicationName": "{0}",' -f $Script:Contract.ApplicationName)) | Out-Null
    $lines.Add(('  "dataFolderName": "{0}",' -f $Script:Contract.DataFolderName)) | Out-Null
    $lines.Add(('  "win32MutexName": "{0}",' -f $Script:Contract.Win32MutexName)) | Out-Null
    $lines.Add(('  "quality": "{0}",' -f $Script:Contract.Quality)) | Out-Null
    $lines.Add(('  "version": "{0}",' -f $Script:Contract.SupportedVersion)) | Out-Null
    $lines.Add(('  "commit": "{0}",' -f $Script:Contract.ProductCommit)) | Out-Null
    $lines.Add('  "checksums": {') | Out-Null
    for ($index = 0; $index -lt $keys.Count; $index++) {
        $key = $keys[$index]
        $full = Join-Under $outRoot $key
        $sum = Get-CursorChecksum $full
        $comma = if ($index -lt ($keys.Count - 1)) { ',' } else { '' }
        $lines.Add(('    "{0}": "{1}"{2}' -f $key, $sum, $comma)) | Out-Null
    }
    $lines.Add('  }') | Out-Null
    $lines.Add('}') | Out-Null
    $json = ($lines -join "`n") + "`n"
    Write-Utf8NoBom (Join-Under $InstallRoot $Script:Contract.ProductJsonRelative) $json
}

function New-FakeInstall([string]$Destination) {
    if (Test-IsForbiddenPath $Destination) {
        throw "禁止在真实安装目录上测试: $Destination"
    }
    if (-not (Test-IsInside $Script:WorkRoot $Destination)) {
        throw "测试路径越出临时工作根: $Destination"
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $textMap = Get-FixtureText
    foreach ($relative in $textMap.Keys) {
        Write-Utf8NoBom (Join-Under $Destination $relative) $textMap[$relative]
    }
    $binaryMap = Get-FixtureBinary
    foreach ($relative in $binaryMap.Keys) {
        $full = Join-Under $Destination $relative
        $parent = Split-Path -Parent $full
        if (-not (Test-Path -LiteralPath $parent)) {
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }
        [System.IO.File]::WriteAllBytes($full, $binaryMap[$relative])
    }
    Write-ProductJson $Destination
}

function Assert-HarnessFixtures {
    $textMap = Get-FixtureText
    foreach ($item in $Script:Contract.Replacements) {
        if (-not $textMap.Contains($item.Path)) {
            throw "契约原文路径不在夹具中: $($item.Path)"
        }
        $content = $textMap[$item.Path]
        if (-not $content.Contains($item.From)) {
            throw "契约原文不在夹具中: $($item.Path) $($item.From)"
        }
        if ($content.Contains($item.To)) {
            throw "夹具在打补丁前就含有译文: $($item.Path) $($item.To)"
        }
    }
    foreach ($item in $Script:Contract.Preserved) {
        if (-not $textMap.Contains($item.Path)) {
            throw "保留文本路径不在夹具中: $($item.Path)"
        }
        if (-not $textMap[$item.Path].Contains($item.Text)) {
            throw "保留文本不在夹具中: $($item.Path) $($item.Text)"
        }
    }
    $commit = [string]$Script:Contract.ProductCommit
    if ($commit.Length -ne 40) {
        throw "夹具 commit 长度应为 40，实际 $($commit.Length)"
    }
}

function Get-ProductObject([string]$InstallRoot) {
    $path = Join-Under $InstallRoot $Script:Contract.ProductJsonRelative
    return (Read-Utf8Strict $path) | ConvertFrom-Json
}

function Get-ChecksumKeysFromProduct($Product) {
    $keys = [System.Collections.Generic.List[string]]::new()
    if ($null -eq $Product -or $null -eq $Product.checksums) {
        return $keys
    }
    foreach ($property in $Product.checksums.PSObject.Properties) {
        $keys.Add($property.Name) | Out-Null
    }
    return $keys
}

function Assert-ChecksumsMatchDisk([string]$InstallRoot, [string]$Label) {
    $product = Get-ProductObject $InstallRoot
    $keys = @(Get-ChecksumKeysFromProduct $product)
    Add-Result ($keys.Count -gt 0) "$Label product.json 仍包含 checksums"
    $outRoot = Join-Under $InstallRoot $Script:Contract.OutRelative
    $expected = @(
        Get-AllFixturePaths (Get-FixtureText) (Get-FixtureBinary) |
            Where-Object { $_.StartsWith($Script:Contract.OutRelative + '/') } |
            ForEach-Object { $_.Substring($Script:Contract.OutRelative.Length + 1) }
    )
    $missing = @($expected | Where-Object { $_ -notin $keys })
    $extra = @($keys | Where-Object { $_ -notin $expected })
    Add-Result (($missing.Count -eq 0) -and ($extra.Count -eq 0)) "$Label checksum 键集合与 out 目录文件一致"
    $allMatch = $true
    foreach ($key in $keys) {
        $full = Join-Under $outRoot $key
        if (-not (Test-Path -LiteralPath $full)) {
            $allMatch = $false
            continue
        }
        $actual = Get-CursorChecksum $full
        $stored = Get-JsonField $product.checksums $key
        if ($stored -ne $actual) {
            $allMatch = $false
        }
    }
    Add-Result $allMatch "$Label 每条 checksum 等于文件 SHA256 Base64（无填充）"
    return $product
}

function Assert-TextHygiene([string]$InstallRoot, [string]$Label) {
    $bad = [System.Collections.Generic.List[string]]::new()
    $rootFull = [System.IO.Path]::GetFullPath($InstallRoot)
    $files = @(Get-ChildItem -LiteralPath $rootFull -Recurse -File -Force)
    foreach ($file in $files) {
        if ($file.Extension -notin $Script:Contract.TextExtensions) {
            continue
        }
        $relative = [System.IO.Path]::GetRelativePath($rootFull, $file.FullName).Replace('\', '/')
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            $bad.Add("$relative BOM") | Out-Null
            continue
        }
        if ($bytes.Length -eq 0) {
            $bad.Add("$relative EMPTY") | Out-Null
            continue
        }
        try {
            $encoding = [System.Text.UTF8Encoding]::new($false, $true)
            $text = $encoding.GetString($bytes)
            if ($text.Contains([char]0xFFFD)) {
                $bad.Add("$relative REPLACEMENT") | Out-Null
            }
        } catch {
            $bad.Add("$relative INVALID_UTF8") | Out-Null
        }
    }
    Add-Result ($bad.Count -eq 0) "$Label 文本文件为 UTF-8 无 BOM 且非空"
    foreach ($item in $bad) {
        Write-Line "    $item"
    }
}

function Assert-StructureMarkers([string]$InstallRoot) {
    $bad = [System.Collections.Generic.List[string]]::new()
    $rootFull = [System.IO.Path]::GetFullPath($InstallRoot)
    $files = @(Get-ChildItem -LiteralPath $rootFull -Recurse -File -Force)
    foreach ($file in $files) {
        if ($file.Extension -notin @('.js', '.css')) {
            continue
        }
        $relative = [System.IO.Path]::GetRelativePath($rootFull, $file.FullName).Replace('\', '/')
        try {
            $text = Read-Utf8Strict $file.FullName
            if (-not $text.Contains('smoke-structure')) {
                $bad.Add($relative) | Out-Null
            }
        } catch {
            $bad.Add("$relative READ") | Out-Null
        }
    }
    Add-Result ($bad.Count -eq 0) 'js/css 仍保留 smoke-structure 标记'
    foreach ($item in $bad) {
        Write-Line "    $item"
    }
}

function Assert-Glossary([string]$InstallRoot) {
    foreach ($item in $Script:Contract.Replacements) {
        $full = Join-Under $InstallRoot $item.Path
        try {
            $text = Read-Utf8Strict $full
            Add-Result ($text.Contains([string]$item.To)) "译文已写入 $($item.Path) $($item.To)"
            Add-Result (-not $text.Contains([string]$item.From)) "原文已消失 $($item.Path) $($item.From)"
        } catch {
            Add-Result $false "无法按 UTF-8 读取 $($item.Path)"
        }
    }
    foreach ($item in $Script:Contract.Preserved) {
        $full = Join-Under $InstallRoot $item.Path
        try {
            $text = Read-Utf8Strict $full
            Add-Result ($text.Contains([string]$item.Text)) "未翻译文本仍在 $($item.Path) $($item.Text)"
        } catch {
            Add-Result $false "无法按 UTF-8 读取保留文本 $($item.Path)"
        }
    }
}

function Assert-ProductIdentity($Before, $After) {
    foreach ($field in @(
            'version', 'nameShort', 'nameLong', 'applicationName', 'commit',
            'quality', 'dataFolderName', 'win32MutexName'
        )) {
        $left = Get-JsonField $Before $field
        $right = Get-JsonField $After $field
        Add-Result ($left -eq $right) "product.json 字段未变 $field"
    }
}

function Assert-ChangedFileSet($Baseline, $Patched, $MustChange) {
    $diffs = Compare-Snapshot $Baseline $Patched
    $changed = [System.Collections.Generic.List[string]]::new()
    $structural = [System.Collections.Generic.List[string]]::new()
    foreach ($diff in $diffs) {
        if ($diff.StartsWith('CHANGED ')) {
            $changed.Add($diff.Substring(8)) | Out-Null
        } else {
            $structural.Add($diff) | Out-Null
        }
    }
    Add-Result ($structural.Count -eq 0) '打补丁后安装树没有增删文件'
    if ($structural.Count -gt 0) {
        Write-Diffs $structural
    }
    $unexpected = @($changed | Where-Object { -not $MustChange.ContainsKey($_) })
    $missed = @($MustChange.Keys | Where-Object { $_ -notin $changed })
    Add-Result (($unexpected.Count -eq 0) -and ($missed.Count -eq 0)) '发生变化的文件集合与契约一致'
    if ($unexpected.Count -gt 0 -or $missed.Count -gt 0) {
        foreach ($item in $unexpected) { Write-Line "    意外变化 $item" }
        foreach ($item in $missed) { Write-Line "    应当变化但未变化 $item" }
    }
}

function Assert-SnapshotEqual($Before, $After, [string]$Message) {
    $diffs = Compare-Snapshot $Before $After
    Add-Result ($diffs.Count -eq 0) $Message
    if ($diffs.Count -gt 0) {
        Write-Diffs $diffs
    }
}

function Exit-Skipped([string[]]$Missing) {
    Write-Line 'cursor-zh-patch smoke'
    Write-Line "仓库: $Script:RepoRoot"
    Write-Line '结果: SKIPPED'
    Write-Line '被测脚本缺失'
    foreach ($path in $Missing) {
        Write-Line "缺失: $path"
    }
    Write-Line '已跳过全部打补丁、还原和负向断言。'
    Write-Line 'SMOKE_STATUS=SKIPPED'
    Write-Line 'SMOKE_EXIT=2'
    exit 2
}

if ([string]::IsNullOrWhiteSpace($PatchScript)) {
    $PatchScript = Join-Path $Script:RepoRoot $Script:Contract.PatchScriptName
} else {
    $PatchScript = [System.IO.Path]::GetFullPath($PatchScript)
}
if ([string]::IsNullOrWhiteSpace($RestoreScript)) {
    $RestoreScript = Join-Path $Script:RepoRoot $Script:Contract.RestoreScriptName
} else {
    $RestoreScript = [System.IO.Path]::GetFullPath($RestoreScript)
}

$missing = [System.Collections.Generic.List[string]]::new()
if (-not (Test-Path -LiteralPath $PatchScript -PathType Leaf)) {
    $missing.Add($PatchScript) | Out-Null
}
if (-not (Test-Path -LiteralPath $RestoreScript -PathType Leaf)) {
    $missing.Add($RestoreScript) | Out-Null
}
if ($missing.Count -gt 0) {
    Exit-Skipped -Missing @($missing)
}

if (-not [string]::IsNullOrWhiteSpace($WorkRoot) -and (Test-IsForbiddenPath $WorkRoot)) {
    Write-Line "拒绝使用真实安装目录: $WorkRoot"
    Write-Line 'SMOKE_STATUS=FAILED'
    Write-Line 'SMOKE_EXIT=1'
    exit 1
}
if ([string]::IsNullOrWhiteSpace($WorkRoot)) {
    $WorkRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('cursor-zh-patch-smoke-' + [guid]::NewGuid().ToString('n'))
}
if (-not [System.IO.Path]::IsPathRooted($WorkRoot)) {
    $WorkRoot = Join-Path (Get-Location) $WorkRoot
}
$Script:WorkRoot = [System.IO.Path]::GetFullPath($WorkRoot)

if (Test-IsForbiddenPath $Script:WorkRoot) {
    Write-Line "拒绝使用真实安装目录: $Script:WorkRoot"
    Write-Line 'SMOKE_STATUS=FAILED'
    Write-Line 'SMOKE_EXIT=1'
    exit 1
}

$script:ExitCode = 1
$started = $false
try {
    Assert-HarnessFixtures
    New-Item -ItemType Directory -Force -Path $Script:WorkRoot | Out-Null
    $started = $true
    Write-Line 'cursor-zh-patch smoke'
    Write-Line "仓库: $Script:RepoRoot"
    Write-Line "假安装工作根: $Script:WorkRoot"
    Write-Line "patch: $PatchScript"
    Write-Line "restore: $RestoreScript"
    Write-Line "受支持版本: $($Script:Contract.SupportedVersion)"
    Write-Line "参数: -$($Script:Contract.InstallPathParameter) -$($Script:Contract.BackupDirParameter)"
    Write-Line '安全边界: 冒烟只写入临时假安装目录。'

    $install = Join-Path $Script:WorkRoot 'install-main'
    $backup = Join-Path $Script:WorkRoot 'backup-main'
    New-FakeInstall $install
    $expectedCount = (Get-AllFixturePaths (Get-FixtureText) (Get-FixtureBinary)).Count
    $baseline = Get-InstallSnapshot $install
    Add-Result ($baseline.Count -eq $expectedCount) "假安装文件数是 $expectedCount"
    Assert-TextHygiene $install '基线'
    $baselineProduct = Assert-ChecksumsMatchDisk $install '基线'
    $mustChange = Get-MustChangeSet

    Write-Line '--- 首次打补丁 ---'
    $first = Invoke-UnderTest $PatchScript $install $backup
    Add-Result ($first.ExitCode -eq 0) '首次打补丁退出码为 0'
    if ($first.ExitCode -ne 0) {
        Write-ChildOutput $first
        Add-Result $false '首次打补丁失败，跳过依赖它的幂等与还原断言'
    } else {
        $patched = Get-InstallSnapshot $install
        Assert-ChangedFileSet $baseline $patched $mustChange
        Assert-Glossary $install
        Assert-TextHygiene $install '打补丁后'
        Assert-StructureMarkers $install
        $patchedProduct = Assert-ChecksumsMatchDisk $install '打补丁后'
        Assert-ProductIdentity $baselineProduct $patchedProduct
        $outPrefix = $Script:Contract.OutRelative + '/'
        foreach ($relative in $mustChange.Keys) {
            if ($relative -eq $Script:Contract.ProductJsonRelative) {
                continue
            }
            $key = $relative.Substring($outPrefix.Length)
            $beforeSum = Get-JsonField $baselineProduct.checksums $key
            $afterSum = Get-JsonField $patchedProduct.checksums $key
            Add-Result (($null -ne $beforeSum) -and ($beforeSum -ne $afterSum)) "checksum 已更新 $key"
        }
        foreach ($key in @(Get-ChecksumKeysFromProduct $patchedProduct)) {
            $relative = $outPrefix + $key
            if ($mustChange.ContainsKey($relative)) {
                continue
            }
            $beforeSum = Get-JsonField $baselineProduct.checksums $key
            $afterSum = Get-JsonField $patchedProduct.checksums $key
            Add-Result ($beforeSum -eq $afterSum) "未改文件的 checksum 保持不变 $key"
        }
        $backupFiles = @(Get-BackupFiles $backup)
        $backupInside = Test-IsInside $install $backup
        Add-Result (-not $backupInside) '备份目录在安装目录之外'
        Add-Result ($backupFiles.Count -ge 1) '备份目录内至少有一个原始文件'

        Write-Line '--- 重复打补丁 ---'
        $second = Invoke-UnderTest $PatchScript $install $backup
        Add-Result ($second.ExitCode -eq 0) '重复打补丁退出码为 0'
        if ($second.ExitCode -ne 0) {
            Write-ChildOutput $second
        }
        $patchedAgain = Get-InstallSnapshot $install
        Assert-SnapshotEqual $patched $patchedAgain '重复打补丁后整树哈希与第一次结果一致'

        Write-Line '--- 还原 ---'
        $restoredRun = Invoke-UnderTest $RestoreScript $install $backup
        Add-Result ($restoredRun.ExitCode -eq 0) '还原退出码为 0'
        if ($restoredRun.ExitCode -ne 0) {
            Write-ChildOutput $restoredRun
        }
        $restored = Get-InstallSnapshot $install
        Assert-SnapshotEqual $baseline $restored '还原后整树哈希与基线一致'
    }

    Write-Line '--- 版本不匹配 ---'
    $versionInstall = Join-Path $Script:WorkRoot 'install-version'
    $versionBackup = Join-Path $Script:WorkRoot 'backup-version'
    New-FakeInstall $versionInstall
    $productPath = Join-Under $versionInstall $Script:Contract.ProductJsonRelative
    $productText = Read-Utf8Strict $productPath
    $needle = '"version": "' + $Script:Contract.SupportedVersion + '"'
    $replacement = '"version": "' + $Script:Contract.MismatchVersion + '"'
    $found = ([regex]::Matches($productText, [regex]::Escape($needle))).Count
    if ($found -ne 1) {
        throw "product.json 里受支持版本字段出现 $found 次，夹具应恰好一次"
    }
    $productText = $productText.Replace($needle, $replacement)
    Write-Utf8NoBom $productPath $productText
    $versionBaseline = Get-InstallSnapshot $versionInstall
    $versionRun = Invoke-UnderTest $PatchScript $versionInstall $versionBackup
    Add-Result ($versionRun.ExitCode -eq 0) '版本不是 3.27.22 时仍打补丁并退出 0'
    $versionOutput = Get-CombinedOutput $versionRun
    Add-Result ($versionOutput.Contains([string]$Script:Contract.MismatchVersion) -and $versionOutput.Contains([string]$Script:Contract.SupportedVersion)) '版本警告同时包含实际版本与受支持版本'
    Add-Result ($versionOutput.Contains('匹配') -and $versionOutput.Contains('未匹配')) '版本不匹配时报告匹配与未匹配数量'
    if ($versionRun.ExitCode -ne 0 -or -not ($versionOutput.Contains([string]$Script:Contract.MismatchVersion))) {
        Write-ChildOutput $versionRun
    }
    $versionAfter = Get-InstallSnapshot $versionInstall
    $versionDiffs = Compare-Snapshot $versionBaseline $versionAfter
    Add-Result ($versionDiffs.Count -gt 0) '版本不匹配时仍然改写命中的文件'
    Add-Result (@(Get-BackupFiles $versionBackup).Count -ge 1) '版本不匹配时仍写入备份'

    Write-Line '--- 路径不存在 ---'
    $missingInstall = Join-Path $Script:WorkRoot 'missing-install'
    if (Test-Path -LiteralPath $missingInstall) {
        throw "负向用例的路径意外存在: $missingInstall"
    }
    foreach ($pair in @(
            @{ Name = 'patch.ps1'; Script = $PatchScript; Backup = (Join-Path $Script:WorkRoot 'backup-missing-patch') },
            @{ Name = 'restore.ps1'; Script = $RestoreScript; Backup = (Join-Path $Script:WorkRoot 'backup-missing-restore') }
        )) {
        $run = Invoke-UnderTest $pair.Script $missingInstall $pair.Backup
        Add-Result ($run.ExitCode -ne 0) "$($pair.Name) 在路径不存在时退出码非 0"
        $output = Get-CombinedOutput $run
        Add-Result ($output.Contains($missingInstall)) "$($pair.Name) 的错误信息包含传入路径"
        if ($run.ExitCode -eq 0 -or -not $output.Contains($missingInstall)) {
            Write-ChildOutput $run
        }
        Add-Result (-not (Test-Path -LiteralPath $missingInstall)) "$($pair.Name) 没有把不存在的路径创建出来"
        Add-Result (@(Get-BackupFiles $pair.Backup).Count -eq 0) "$($pair.Name) 在路径不存在时不写备份"
    }

    if ($Script:Failures.Count -eq 0 -and $Script:Passes -gt 0) {
        $script:ExitCode = 0
    }
} catch {
    Write-Line "异常: $($_.Exception.Message)"
    Write-Line $_.ScriptStackTrace
    $script:ExitCode = 1
} finally {
    if ($started -and $script:ExitCode -eq 0 -and -not $KeepWorkRoot) {
        try {
            Remove-Item -LiteralPath $Script:WorkRoot -Recurse -Force
        } catch {
            Write-Line "清理失败: $($_.Exception.Message)"
        }
    } elseif ($started -and (Test-Path -LiteralPath $Script:WorkRoot)) {
        Write-Line "保留现场: $Script:WorkRoot"
    }
}

if ($script:ExitCode -eq 0 -and $Script:Passes -eq 0) {
    Write-Line '没有执行任何断言'
    $script:ExitCode = 1
}

Write-Line "断言通过: $Script:Passes 失败: $($Script:Failures.Count)"
if ($script:ExitCode -eq 0) {
    Write-Line 'SMOKE_STATUS=PASSED'
} else {
    Write-Line 'SMOKE_STATUS=FAILED'
    if ($Script:Failures.Count -gt 0) {
        Write-Line '失败项:'
        foreach ($failure in $Script:Failures) {
            Write-Line "  - $failure"
        }
    }
}
Write-Line "SMOKE_EXIT=$script:ExitCode"
exit $script:ExitCode
