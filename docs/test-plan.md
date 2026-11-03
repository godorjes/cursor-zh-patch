# Cursor 3.27.22 Windows 桌面版汉化测试方案

本文给并行编写 `patch.ps1`、`restore.ps1` 和文案提取脚本的人，以及在 Windows 上做手工验收的人。本文件只定义测试。补丁实现以仓库里的脚本为准。

可执行契约（参数名、词表、校验和算法）集中在 [`tests/smoke.ps1`](../tests/smoke.ps1) 的「接口契约」段。改对齐方式时只改那一段，并同步更新本文对应表格。

## 安全边界

所有测试只在下面两类目录上进行：

- **假安装**：`tests/smoke.ps1` 在系统临时目录里生成的最小目录。它模仿 Cursor 的文件布局，不能当作真正的编辑器启动。
- **实验室副本**：从真实安装只读复制出来的完整目录。下文用 `D:\cursor-zh-patch-lab\cursor-3.27.22` 表示。复制完成之后，打补丁、还原、改版本、启动界面，全部指向这份副本。

禁止把 `-InstallPath`、备份、手工启动、写文件或就地改码指向真实安装目录 `F:\cursor\cursor`。只读复制和只读哈希清单可以读它。清单文件写到实验室目录，不写回真实安装目录。

手工项（启动 Cursor、看聊天 / Agent / 设置页）同样只启动实验室副本里的 `Cursor.exe`。不要用开始菜单里指向 `F:\cursor\cursor` 的快捷方式。

违反安全边界，整次测试失败。

## 环境

| 项 | 值 |
| --- | --- |
| 目标产品 | Windows 桌面版 Cursor `3.27.22` |
| 真实安装（只读来源） | `F:\cursor\cursor` |
| 实验室副本 | `D:\cursor-zh-patch-lab\cursor-3.27.22` |
| 实验室备份 | `D:\cursor-zh-patch-lab\backup\cursor-3.27.22` |
| 自动化运行时 | PowerShell 7（`pwsh`），Windows 与 Linux 都要能跑 |
| 版本字段 | `resources/app/product.json` 的 `version` |

实验室路径只是示例。可以换盘符，但不能等于 `F:\cursor\cursor`，也不能放在它的子目录里。

准备副本：

1. 退出所有从 `F:\cursor\cursor` 启动的 Cursor。
2. 按本文「手工哈希」对真实目录做只读清单，保存为 `D:\cursor-zh-patch-lab\real-install.before.txt`。
3. 只读复制：

```powershell
$real = 'F:\cursor\cursor'
$lab = 'D:\cursor-zh-patch-lab\cursor-3.27.22'
New-Item -ItemType Directory -Force -Path (Split-Path $lab) | Out-Null
Copy-Item -LiteralPath $real -Destination $lab -Recurse
```

4. 确认副本版本是 `3.27.22`：

```powershell
(Get-Content -Raw -LiteralPath "$lab\resources\app\product.json" | ConvertFrom-Json).version
```

5. 全部用例结束后，再对真实目录做一次只读清单 `real-install.after.txt`。两份清单逐行一致。

若副本里只有 `resources\app.asar`，没有 `resources\app\product.json`，在测试记录里写明实际结构并暂停启动类用例。不要对真实安装解包。当前契约按已展开的 `resources\app\` 目录编写。

## 怎么跑冒烟

在仓库根目录：

```powershell
pwsh -NoProfile -File .\tests\smoke.ps1
```

Linux 上同样这条命令。工作目录不限，脚本用自己的路径找仓库根。

| 退出码 | 含义 |
| --- | --- |
| `0` | 断言全部执行并通过 |
| `1` | 有断言失败，或脚本异常 |
| `2` | 被测脚本缺失。已跳过全部断言。日志含「被测脚本缺失」和 `SMOKE_STATUS=SKIPPED` |

退出码 `2` 是跳过，日志里不会出现 `SMOKE_STATUS=PASSED`。GitHub Actions 工作流 `.github/workflows/smoke.yml` 在 Ubuntu 和 Windows 上跑同一条命令；退出码 `2` 会让该作业失败，避免把「还没测」显示成通过。

`patch.ps1` 与 `restore.ps1` 都落地之后，冒烟会在临时假安装上自动做：基线哈希、首次打补丁、再打一次（幂等）、还原后与基线逐文件一致、路径不存在时非零退出、版本不匹配时拒绝且不改文件。

维护者可以用下面的参数把冒烟指到尚未放到仓库根的脚本。这只改「去哪找被测脚本」，不改传给它们的参数名：

```powershell
pwsh -NoProfile -File .\tests\smoke.ps1 -PatchScript D:\src\patch.ps1 -RestoreScript D:\src\restore.ps1
```

失败时脚本会留下临时目录，日志里有 `保留现场:`。成功时删除临时目录。

## 接口约定

冒烟用下面的方式调用两个脚本。参数只在 `tests/smoke.ps1` 的契约段拼出来。

```powershell
pwsh -NoProfile -NonInteractive -File .\patch.ps1 -InstallPath <安装根> -BackupDir <备份目录>
pwsh -NoProfile -NonInteractive -File .\restore.ps1 -InstallPath <安装根> -BackupDir <备份目录>
```

| 项 | 约定 |
| --- | --- |
| 脚本位置 | 仓库根目录 `patch.ps1`、`restore.ps1` |
| `-InstallPath` | 安装根，里面有 `Cursor.exe` 和 `resources\app\` |
| `-BackupDir` | 备份写在这个目录里面，并且位于安装根之外。冒烟每次传入临时目录下的独立路径，不依赖脚本自己的默认位置 |
| 版本 | 只接受 `product.json` 里的 `3.27.22`。不读 `package.json` 充当版本来源 |
| 成功 | 退出码 `0`。已经打过再次执行也是 `0`，文件字节与第一次打完后相同 |
| 路径不存在 | 退出码非 `0`（建议 `2`）。输出里包含传入的路径。不创建该路径，不写备份文件 |
| 版本不匹配 | 退出码非 `0`（建议 `3`）。输出里同时有检测到的版本号和 `3.27.22`。安装树一个字节都不改，不写备份文件。无 TTY 时直接拒绝 |
| Cursor 正在运行 | 退出码非 `0`（建议 `4`）。说明进程仍在运行，需要先退出。无 TTY 时直接拒绝，不调用 `Read-Host`。安装树不改 |
| 其他失败 | 退出码非 `0`（建议 `1`） |
| 输出 | 人能读的文本写到 stdout 或 stderr。不要只靠 `$ErrorActionPreference = 'Stop'` 下的 `Write-Error`，那种写法可能在走到 `exit` 之前就中断，退出码会变成别的数字 |
| 校验和 | 见下一节。改过字节的 `resources/app/out` 文件必须同步更新 `product.json` 的 `checksums`。键集合保持不变。`version`、`nameShort`、`nameLong`、`applicationName`、`commit`、`quality`、`dataFolderName`、`win32MutexName` 保持不变 |
| 备份 | 放在 `-BackupDir` 内。内部可以是目录镜像或单个归档。`restore.ps1` 使用同一个 `-BackupDir` 把安装根恢复成打补丁前的文件集合和字节 |
| 安装树 | 打补丁不在安装根内增加或删除文件。备份不要放进安装根 |
| 编码 | 写回的 `.js`、`.json`、`.css` 使用 UTF-8，无 BOM。未命中词表的文件保持原字节，包括换行 |
| 词表 | 按契约里带引号的原文整段替换。更长的原文先替换 |

冒烟强制检查的是：成功为 `0`、拒绝为非 `0`、提示里有约定的版本号或路径、文件哈希、校验和与磁盘一致、UTF-8 无 BOM。建议退出码 `2`、`3`、`4` 目前不逐个断言，实现可以用别的非 `0` 数字。

## 校验和

Cursor 启动时会把 `resources/app/product.json` 里 `checksums` 的值与 `resources/app/out` 下对应文件比较。对不上时界面会出现类似下面的提示，测试里任意一条都算失败：

- `Your installation appears to be corrupt`
- `Your Cursor installation appears to be corrupt. Please reinstall.`
- `安装已损坏`

算法与现行 Cursor / VS Code 一致：文件字节的 SHA256，标准 Base64，去掉末尾的 `=`。键使用正斜杠，相对于 `resources/app/out`。例如 `vs/workbench/workbench.desktop.main.js`。

冒烟夹具会为 `resources/app/out` 下的每个文件写入一条正确的基线校验和。补丁改完文件后，这些值必须改成新字节的校验和。删掉整个 `checksums` 对象不算通过。

## 假安装里有什么

冒烟在临时目录生成这些相对路径。内容是短夹具，用来锁定行为，不是 Cursor 原文件。

```text
Cursor.exe
locales/en-US.pak
locales/en-GB.pak
resources/app/package.json
resources/app/product.json
resources/app/out/main.js
resources/app/out/nls.keys.json
resources/app/out/nls.messages.json
resources/app/out/vs/base/parts/sandbox/electron-sandbox/preload.js
resources/app/out/vs/code/electron-sandbox/workbench/workbench.js
resources/app/out/vs/workbench/workbench.desktop.main.css
resources/app/out/vs/workbench/workbench.desktop.main.js
resources/app/out/vs/workbench/workbench.glass.main.js
resources/app/out/vs/workbench/api/node/extensionHostProcess.js
resources/app/out/vs/workbench/contrib/composer/browser/preload-webview-browser.js
```

`workbench.desktop.main.js` 代表传统工作台，`workbench.glass.main.js` 代表较新的 Glass 界面。两个包里命中词表的字符串都要翻译。

### 占位词表

正式词表由文案提取脚本落地后，只替换 `tests/smoke.ps1` 契约里的 `Replacements` 和 `Preserved`，再同步下表。在那之前，冒烟用这张占位表。

替换按带引号的原文整段进行，顺序必须是更长的在前：`"Cursor Settings"`、`"New Agent"`、`"New Chat"`，然后才是 `"Settings"`、`"Agent"`、`"Chat"`。

| 区域 | 夹具文件 | 原文 | 译文 |
| --- | --- | --- | --- |
| 聊天 | `resources/app/out/vs/workbench/workbench.desktop.main.js` | `"New Chat"` | `"新建聊天"` |
| 聊天 | 同上 | `"Chat"` | `"聊天"` |
| 设置 | 同上 | `"Settings"` | `"设置"` |
| Agent | `resources/app/out/vs/workbench/workbench.glass.main.js` | `"New Agent"` | `"新建智能体"` |
| Agent | 同上 | `"Agent"` | `"智能体"` |
| Agent | `resources/app/out/vs/workbench/contrib/composer/browser/preload-webview-browser.js` | `"Agent"` | `"智能体"` |
| 设置 | `resources/app/out/nls.messages.json` | `"Cursor Settings"` | `"Cursor 设置"` |
| 设置 | 同上 | `"Settings"` | `"设置"` |

必须原样留下的英文：

| 夹具文件 | 文本 |
| --- | --- |
| `resources/app/out/nls.messages.json` | `"Keep This English Label"` |
| `resources/app/out/vs/workbench/api/node/extensionHostProcess.js` | `"Reload Window"` |

打补丁之后，上表译文以 UTF-8 汉字写在文件里。只写成 `\uXXXX` 转义、界面仍可能正常，但冒烟不把它算作译文已写入。

未列入上表的文件（`Cursor.exe`、两个 `.pak`、`package.json`、`main.js`、`nls.keys.json`、`preload.js`、CSS、`extensionHostProcess.js`、沙箱 `workbench.js`）哈希必须与打补丁前相同。`extensionHostProcess.js` 因为含有保留英文，所以整文件都不改。

每个被改写的 `.js` / `.css` 仍保留标记 `smoke-structure`，避免补丁把文件清空后只留下译文。

## 手工哈希

在实验室副本上比较「逐文件一致」时用 SHA256，路径写成正斜杠。这与 `product.json` 里的 Base64 校验和不是同一种编码，两套都要查。

```powershell
function Export-TreeHash([string]$Root, [string]$OutFile) {
    $rootFull = [System.IO.Path]::GetFullPath($Root)
    $lines = Get-ChildItem -LiteralPath $rootFull -Recurse -File -Force |
        Sort-Object FullName |
        ForEach-Object {
            $rel = [System.IO.Path]::GetRelativePath($rootFull, $_.FullName).Replace('\', '/')
            $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
            '{0}  {1}' -f $hash, $rel
        }
    $enc = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllLines($OutFile, $lines, $enc)
}
```

两次清单用同一套函数生成后，用比较工具看差异。没有差异才算一致。比较前确认清单没有把 `-BackupDir` 算进安装根。

## 用例

### TP-00 安全边界

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 手动。冒烟脚本另外拒绝把工作目录设到 `F:\cursor\cursor` 及其父子路径 |
| 前置条件 | 已知真实安装在 `F:\cursor\cursor`。Cursor 已退出。实验室目录还不存在，或是空目录 |
| 步骤 | 1. 按「环境」生成 `real-install.before.txt`。2. 复制出实验室副本。3. 之后每个用例的 `-InstallPath` 都先肉眼核对，不是 `F:\cursor\cursor`。4. 启动时看任务管理器里 `Cursor.exe` 的路径属于实验室副本。5. 全部用例结束后生成 `real-install.after.txt` 并比较 |
| 预期结果 | 两份真实目录清单一致。没有任何写操作落在 `F:\cursor\cursor`。冒烟日志里的假安装路径位于系统临时目录 |

### TP-01 首次打补丁

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 自动。补丁脚本落地后，在实验室副本上再手工做一次 |
| 前置条件 | 满足 TP-00。安装根是假安装或尚未打过补丁的实验室副本。`product.json` 的 `version` 为 `3.27.22`。Cursor 没有在运行。`-BackupDir` 是安装根之外的空目录 |
| 步骤 | 1. 对安装根做哈希清单 `before.txt`。2. 运行 `pwsh -NoProfile -NonInteractive -File .\patch.ps1 -InstallPath <安装根> -BackupDir <备份目录>`。3. 再做清单 `patched.txt`。4. 检查词表、保留英文、`checksums`、编码 |
| 预期结果 | 退出码 `0`。词表原文被换成对应译文，保留英文仍在。`checksums` 键集合不变，每条等于对应文件的 SHA256 Base64（无 `=`），而且被改写文件的校验和与打补丁前不同。`version` 仍是 `3.27.22`。安装根内文件没有增减。未命中词表的文件哈希不变。`.js` / `.json` / `.css` 为 UTF-8 无 BOM，非空。`-BackupDir` 在安装根之外且里面至少有一个文件。冒烟在临时假安装上检查同一组条件 |

### TP-02 重复打补丁（幂等）

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 自动。实验室副本可手工复核 |
| 前置条件 | TP-01 已在同一安装根上成功，保留当时的 `patched.txt` 和同一个 `-BackupDir` |
| 步骤 | 1. 用同一组参数再运行一次 `patch.ps1`。2. 生成 `patched-again.txt` |
| 预期结果 | 退出码 `0`。`patched-again.txt` 与 `patched.txt` 逐行一致。不出现第二套不同内容的安装文件。冒烟比较的是两次运行之后的整树 SHA256 |

### TP-03 还原后逐文件哈希一致

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 自动。实验室副本可手工复核 |
| 前置条件 | 同一安装根已做过 TP-01，`-BackupDir` 仍是那一次的备份。手头有 `before.txt` |
| 步骤 | 1. 运行 `pwsh -NoProfile -NonInteractive -File .\restore.ps1 -InstallPath <安装根> -BackupDir <备份目录>`。2. 生成 `restored.txt` |
| 预期结果 | 退出码 `0`。`restored.txt` 与 `before.txt` 逐行一致：文件集合相同，每个文件 SHA256 相同。冒烟对假安装做同样的整树比较 |

### TP-04 版本不匹配

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 自动。实验室副本可手工复核 |
| 前置条件 | 满足 TP-00。使用一份新的未打补丁副本（或冒烟自己生成的第二份假安装）。不要在已经打过补丁、准备拿来还原的那份目录上改版本 |
| 步骤 | 1. 只把该副本 `resources/app/product.json` 的 `version` 从 `3.27.22` 改成 `9.9.9`（冒烟用这个版本号）。其余字节不动。2. 做哈希清单。3. 用新的空 `-BackupDir` 运行 `patch.ps1`。4. 再做哈希清单 |
| 预期结果 | 退出码非 `0`。输出里同时看得到 `9.9.9` 和 `3.27.22`。安装根哈希不变。`-BackupDir` 里没有文件。无 TTY 时脚本直接结束，不询问是否继续 |

### TP-05 安装路径不存在

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 自动 |
| 前置条件 | 准备一个确定不存在的路径，且该路径不是 `F:\cursor\cursor`。例如 `D:\cursor-zh-patch-lab\does-not-exist`。父目录可以存在，目标本身不存在 |
| 步骤 | 1. 确认该路径不存在。2. 对它运行 `patch.ps1`，`-BackupDir` 指向另一个空的临时目录。3. 再对它运行 `restore.ps1` |
| 预期结果 | 两次退出码都非 `0`。两次输出都包含传入的那个路径。目标路径仍然不存在。两个备份目录里都没有文件 |

### TP-06 Cursor 正在运行时打补丁

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 手动。冒烟不启动名为 Cursor 的进程，避免和桌面上的真实进程搅在一起 |
| 前置条件 | 满足 TP-00。实验室副本尚未打补丁，并已有 `before.txt`。从真实目录启动的 Cursor 已全部退出。只从实验室副本启动 `Cursor.exe`，任务管理器里的映像路径指向副本 |
| 步骤 | 1. 保持这份副本的 Cursor 窗口打开。2. 在非交互终端运行 `pwsh -NoProfile -NonInteractive -File .\patch.ps1 -InstallPath <实验室副本> -BackupDir <新的备份目录>`。3. 关闭副本的 Cursor。4. 比较安装根哈希与 `before.txt` |
| 预期结果 | 命令非 `0` 退出，过程中没有停下来等键盘。输出说明 Cursor 正在运行，并写明需要先退出。安装根与 `before.txt` 一致。关闭副本进程后，再执行 TP-01 可以成功。若实现按进程名而不是按路径判断，本机任何一个 `Cursor` 进程都会触发拒绝；这仍然要求 `-InstallPath` 只指向副本 |

### TP-07 打完补丁后能启动，且不报安装损坏

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 校验和部分自动（含在 TP-01 的冒烟断言里）。启动与对话框为手动 |
| 前置条件 | 满足 TP-00。实验室副本已按 TP-01 打过补丁。`checksums` 已按「校验和」一节更新。从真实目录启动的 Cursor 已退出 |
| 步骤 | 1. 只启动实验室副本的 `Cursor.exe`。2. 等主窗口出现，观察约 10 秒。3. 完全退出后再启动一次。4. 若出现损坏提示，不要点重装或修复 |
| 预期结果 | 两次启动都出现主窗口。不出现「校验和」一节列出的任何损坏文案，日志里也没有 `Installation has been modified on disk`。主窗口有内容，不是白屏。冒烟侧则要求假安装里每条 `checksums` 与当前文件字节一致，且键还在 |

### TP-08 未翻译的文字保留英文，无乱码、无空白

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 编码、保留英文、文件非空由冒烟自动检查。界面为手动 |
| 前置条件 | 实验室副本已打补丁并能完成 TP-07 的启动。手头有占位词表或当时已经替换进来的正式词表 |
| 步骤 | 1. 在副本里打开聊天、Agent、设置页，以及一个明确不在词表中的命令或标签（夹具里对应 `"Reload Window"` 和 `"Keep This English Label"`；真实界面选一条词表未收录的英文）。2. 看按钮、标题、输入框占位符。3. 抽查被改写的 `.js`、`.json`、`.css`，确认文件开头不是 UTF-8 BOM（字节 `EF BB BF`） |
| 预期结果 | 词表未收录的字符串仍是原来的英文，可读。界面没有 `U+FFFD`、连续问号、方框或空白按钮。中文是正常汉字。冒烟在假安装上检查保留字符串仍在、译文是 UTF-8 汉字、文本文件无 BOM 且非空、`smoke-structure` 仍在 |

### TP-09 P0 区域汉化生效

| 项 | 内容 |
| --- | --- |
| 优先级 | P0 |
| 执行方式 | 假安装上的契约字符串由冒烟自动检查。真实界面为手动 |
| 前置条件 | 同 TP-08。导航时优先点侧边栏图标，不依赖「已经被翻译的菜单名」才能找到页面 |
| 步骤 | 1. 打开聊天表面，查看新建聊天和聊天相关标签。2. 打开 Agent / Composer 表面，查看 Agent 入口和新建动作。3. 打开设置页，查看设置和 Cursor Settings 对应的标题。4. 对照当时的词表记录实际文案 |
| 预期结果 | 三个表面里，词表已经覆盖的英文都变成了对应中文。假安装上必须精确等于占位表：聊天为「新建聊天」「聊天」，Agent 为「智能体」「新建智能体」，设置为「设置」「Cursor 设置」。真实界面以补丁实际携带的词表为准，三个区域都要出现中文，并同时满足 TP-08。品牌词若词表规定保留英文，则该词保留，周围已经收录的说明文字为中文 |

## 覆盖对照

| 用例 | 冒烟 | 实验室副本手工 |
| --- | --- | --- |
| TP-00 安全边界 | 拒绝把工作根指到真实安装路径 | 只读清单证明真实目录未被写入；启动的是副本 |
| TP-01 首次打补丁 | 是 | 补丁落地后复核一次 |
| TP-02 幂等 | 是 | 可复核 |
| TP-03 还原哈希 | 是 | 可复核 |
| TP-04 版本不匹配 | 是，夹具版本 `9.9.9` | 可复核 |
| TP-05 路径不存在 | 是，`patch.ps1` 与 `restore.ps1` 都测 | 可复核 |
| TP-06 进程正在运行 | 否 | 是 |
| TP-07 无损坏提示 | 只覆盖 `checksums` 与磁盘一致 | 启动两次，看对话框 |
| TP-08 英文保留、无乱码无空白 | 编码、保留字符串、非空、结构标记 | 看三个 P0 表面 |
| TP-09 P0 汉化生效 | 占位词表的精确字符串 | 看聊天、Agent、设置页 |

## 风险

- 占位词表里的「智能体」「新建聊天」等译文，可能和文案提取脚本的正式译法不同。正式表落地后只改契约段和本文的表。
- 假安装通过，只说明脚本遵守了这张契约。TP-07、TP-08、TP-09 的界面结论仍然来自实验室副本上的真实启动。
- 校验和按 SHA256、Base64、去掉末尾 `=` 实现。若 `3.27.22` 的某个通道用了别的算法，要改 `tests/smoke.ps1` 里的 `Get-CursorChecksum`，并更新本文。
- 契约假定安装已经展开成 `resources/app/`，并且打补丁会遍历其中的 `.js`、`.json`、`.css`。只替换单一打包文件时，夹具里其他路径上的词会留下英文，冒烟会失败。
- 短词先替换会把 `"New Chat"` 拆开，端状态到不了 `"新建聊天"`。
- 进程检测若只看进程名，真实安装的 Cursor 开着也会拒绝。测试仍然只把 `-InstallPath` 指到副本。
- 当前仓库还没有被测脚本时，CI 是红的。日志应为 `SMOKE_STATUS=SKIPPED` 与「被测脚本缺失」。
