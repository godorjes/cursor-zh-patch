# cursor-zh-patch

把 Windows 桌面版 Cursor 的界面补成简体中文。术语以仓库里的 [`docs/glossary.md`](docs/glossary.md) 为准（产品维护）。本仓库不另放一份术语表。

锁定验证过的版本是 **Cursor 3.27.22**（VS Code 1.128.0）。其他版本会收到警告，脚本仍会打补丁。

## 环境

- Windows 10/11，PowerShell 5.1 或 PowerShell 7
- Node.js 18 或更高（字符串替换和 `node --check`）
- 安装目录已展开，存在 `resources\app\product.json`。只有 `app.asar` 时脚本会拒绝

## 用法

先完全退出 Cursor。在仓库根目录：

```powershell
pwsh -NoProfile -File .\patch.ps1 -InstallPath F:\cursor\cursor -BackupDir D:\cursor-zh-backup
```

省略 `-InstallPath` 时，脚本会查常见目录、卸载注册表和正在运行的 `Cursor.exe`。省略 `-BackupDir` 时，备份写到仓库下的 `backups\<版本>\`，不会写进安装目录。

还原：

```powershell
pwsh -NoProfile -File .\restore.ps1 -InstallPath F:\cursor\cursor -BackupDir D:\cursor-zh-backup
```

`patch.bat` 默认会加上 `-SetLocale -InstallLanguagePack`：设置 `locale=zh-cn`，用 `Cursor.exe --install-extension` 安装语言包，并删除 `%APPDATA%\Cursor\clp`（语言包消息缓存）。删掉缓存后，下次启动会按当前的 `nls.messages.json` 重新生成。`patch.ps1` 本身不加这两个开关，方便只改安装目录。

- `-SetLocale`：把 `%USERPROFILE%\.cursor\argv.json` 的 `locale` 设为 `zh-cn`，并先备份这份文件
- `-InstallLanguagePack`：下载已核对存在的官方包 `MS-CEINTL.vscode-language-pack-zh-hans` **1.128.2026071013**（`engines.vscode` 为 `^1.128.0`，2026-07-10 发布），交给 `Cursor.exe --install-extension`。成功后删除 `%APPDATA%\Cursor\clp`

## 脚本做什么

| 文件 | 作用 |
| --- | --- |
| `patch.ps1` | 定位安装、检查进程和布局、按版本备份、调用 Node 改文件、按需设置语言 |
| `restore.ps1` | 把 `-BackupDir` 里的原始字节拷回安装目录，并恢复 `argv.json` |
| `i18n/zh-CN.json` | 整句原文 → 译文。只替换引号里的完整字符串 |
| `i18n/exclude.json` | 必须保留英文的专名和插入 token（Agent、Ask、Plan、`@Web` 等） |
| `tools/extract.js` | 从 workbench 脚本和 `nls.messages.json` 抽出待译字符串，支持增量 |
| `tools/extract.ps1` | 上面这个提取器的 Windows 入口 |
| `tools/export-contexts.js` | 导出每条映射在三个目标文件里的命中上下文，供短句允许表人工复核 |

只改这三个文件：`out/vs/workbench/workbench.desktop.main.js`、`out/vs/workbench/workbench.glass.main.js`、`out/nls.messages.json`。`extensions/` 和其他脚本不动。

映射表里的替换是**整段字面量**：`"New Chat"` 会变成 `"新聊天"`，不会把 `"Apply {0} changes"` 里的 `Apply` 当成命中。键区分大小写，`"Sign in"` 和 `"Sign In"` 是两条。比较（左右都可以）、`switch case`、`对象.字段 = "..."`、下标、`in`、`includes` / `indexOf` / `startsWith` / `endsWith` / `get` / `has` / `set` / `delete`、`publicLog*`、以及 `type` / `name` / `kind` / `value` / `id` 和 `data-*` 的值，这些出现位置一律不改。

一到两个词、且不含占位符的短句，只有写在 `i18n/short-allowlist.json` 里、并且这一处是界面文字、nls 原文参数或命令标题时才会替换。比较、枚举赋值这类出现位置即使在允许表里也不改。`New Agent`、`Accept`、`General`、`Models`、`Local`、`Cloud`、`On`、`Off`、`Enabled`、`Disabled` 已按界面上下文放行。`Keep`、`Apply`、`Usage` 仍先留英文，等 `export-contexts.js` 的上下文复核后再加。

成功时标准输出第一行固定是 `匹配报告: 命中=N 未命中=M`，下一行是 `跳过=K`。命中 = 实际替换掉的字面量次数 + 故意留在 nls `original` 参数或 `original:` 字段里的英文次数。跳过 = 危险上下文和没进允许表的短句出现次数，不算进命中。未命中 = 映射表里在这三个文件中一次完整字面量都没出现的条目数。同一条键可以既有命中也有跳过。

VS Code 核心界面靠官方语言包和 `locale=zh-cn`。Cursor 自己的字符串有两条路：

- 已经进 `nls.messages.json` 的，改目录里的英文；`localize2` 调用里的英文参数留着，命令面板仍能用英文搜到（`alias` 来自 `original`）
- 直接写在这两个 workbench 文件里的整句，按映射表替换

改过的、并且出现在 `product.json` 的 `checksums` 里的文件，会重算校验和：SHA-256，标准 Base64，去掉末尾 `=`。键集合以及 `version`、`commit` 等字段不动。3.27.22 的校验和清单只有 6 个文件；`workbench.glass.main.js` 和 `nls.messages.json` 不在清单里，改它们不会触发“安装似乎已损坏”。`workbench.desktop.main.js` 在清单里，校验和已经按同一算法对过官方包。

没有命中的文件保持原字节。不在安装根里增删文件。脚本不会调用 `Read-Host`。

## 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功。已经打过补丁再跑一次也是 0，安装树字节与第一次相同 |
| 2 | `-InstallPath` 不存在。不改安装目录，不写备份 |
| 3 | `product.json` 缺少 `version` 或无法解析。不改安装目录，不写备份 |
| 4 | Cursor 正在运行。不改安装目录，不写备份 |
| 1 | 其他失败，例如只有 `app.asar`、备份目录在安装根里面、语法检查失败、备份版本或哈希对不上 |

备份清单记下 `version` 和 `commit`。同一 `-BackupDir` 遇到另一个版本时，新备份写到 `by-build/<版本>__<commit>/`，不会把旧文件盖回新安装。还原时版本或 commit 不一致就拒绝。再次打补丁会给还没备份过的文件补一份原始字节。用备份之前，当前文件的哈希必须等于记录的原始哈希或上次打完补丁的哈希，否则拒绝。

版本不是 3.27.22 时打印警告（含实际版本和 3.27.22），继续打补丁，并打印匹配 / 未匹配条数，退出码 0。

## Cursor 更新之后

每个版本一份备份。更新后：

1. 用 `tools/extract.ps1 -InstallPath <新安装目录>` 做增量提取。已在 `i18n/zh-CN.json` 或 `i18n/extracted.json` 里的句子不会重复导出，新句子写到 `i18n/pending.json`
2. 按 `docs/glossary.md` 把 `pending.json` 里的句子译进 `zh-CN.json`。含 Agent 的译文必须保留英文 Agent，不要写成“智能体”或“代理”。原文里的 `{0}`、`&&` 必须原样保留，菜单助记符写成 `文件(&&F)` 这种形式
3. 对新版本再执行 `patch.ps1`。备份按 `product.json` 的 `version` 分开，不会用打过补丁的文件覆盖旧的干净备份

服务端下发的模型列表、方案、用量数值和部分错误信息不在本地文件里，补丁碰不到。

## 风险

- 这是在改安装目录里的程序文件。语法检查失败会中止，并且不会留下半套补丁；已经成功的补丁可以用 `restore.ps1` 还原
- 自动更新会换掉这些文件，补丁失效，需要按上面的步骤重做
- 官方语言包翻译的是 VS Code 核心文案，和本表在个别词上可能不完全一样。Cursor 专有字符串以 `docs/glossary.md` 为准
- `Accept`、`New Agent`、`General`、`Models` 等在 3.27.22 里同时被当成界面文字和功能 token，脚本整条保留英文。见下方实测

## 3.27.22 实测（Linux 官方包，与 Windows 同一套 workbench 资源）

包：`Cursor 3.27.22`，commit `b1aa50cb6db84fd3e8c808259cb172ea73425c10`，vscode `1.128.0`。在解包后的 `resources/app` 上跑过打补丁、再打一次、还原。`node --check` 通过，`workbench.desktop.main.js` 的校验和与 `product.json` 一致。没有把这台机器上的图形界面点开，最终界面要在 Windows 上确认。

- **Rules for AI**：desktop、glass、`nls.messages.json` 里都没有这句。3.27.22 已不存在这条设置名
- **Notepads**：没有独立的 `"Notepads"` 字面量。还留着开发者命令 `Export Notepads to Files`、能力开关 `supportsNotepads`，以及协议字段。它不再是一块主要界面
- **Background Agent**：还在。出现在页签的 HTML 标题（`title="Background Agent"`）和报错句子里，不是一条单独的可替换字面量。按术语表保留英文，映射表不翻译它
- **Memories**：有一条界面标签 `"Memories"`，已译为“记忆”。其余大量 `Memory` 是协议名，不是界面文案
- **命令面板英文搜索**：`De` / `It`（localize2）注册的命令会把英文留在调用参数里，显示走翻译后的 nls。注册表用 `original` 做 `alias`，命令面板同时匹配 label 和 alias，因此这类命令打补丁后仍可用英文搜索。直接用 `title:k(索引, null)` 的命令只有一条运行时字符串；若该字符串被译成中文，英文别名不会自动出现。3.27.22 里大量命令走的是 localize2。这一点没有在图形界面里点过命令面板

同一次实跑还跳过了这些“显示 + token”字符串（保持英文）：`Accept`、`New Agent`、`General`、`Models`、`Off`、`Disabled`、`Local`、`Cloud`、`Subagents`、`Hooks`。

## 开发

```powershell
node --test tests/*.test.js
pwsh -NoProfile -File .\tests\smoke.ps1
```

冒烟在临时假安装上检查退出码、整树哈希、还原、校验和、UTF-8 无 BOM，以及术语表里的样例句子。它不会碰 `F:\cursor\cursor`。
