# Cursor 3.27.22 简体中文汉化：术语表与翻译风格规范

> 适用版本：Windows 桌面版 Cursor **3.27.22**（版本锁定，升级后需复核）
> 维护人：产品（术语负责人）；对齐人：开发人员一（补丁脚本）；验证：测试人员一
> 状态：草案 v0.1，待开发组长评审

本文件是汉化的**唯一术语来源**。补丁中所有 P0 字符串必须与本表一致（见 `docs/acceptance.md`）。如需新增或修改术语，请在 PR 中修改本表，不要只在补丁里改。

## 0. 参考来源

| 代号 | 来源 | 用途 |
| --- | --- | --- |
| [官方-Agent] | https://cursor.com/cn/docs/agent/overview | 智能体/检查点/工具名称 |
| [官方-提示] | https://cursor.com/cn/docs/agent/prompting | @ 提及、上下文、聊天输入框 |
| [官方-规则] | https://cursor.com/cn/docs/rules 、https://cursor.com/cn/help/customization/rules | 规则、项目规则、用户规则、团队规则、规则类型 |
| [官方-MCP] | https://cursor.com/cn/docs/mcp | MCP、MCP 服务器、自定义、插件市场 |
| [官方-Plan] | https://cursor.com/cn/help/ai-features/plan-mode | Plan 模式、Agent 面板 |
| [官方-Ask] | https://cursor.com/cn/help/ai-features/ask-mode | Ask 模式、模式选择器 |
| [官方-Max] | https://cursor.com/cn/help/ai-features/max-mode | Max Mode、模型选择器、方案 |
| [官方-Tab] | https://cursor.com/cn/help/troubleshooting/tab-issues | Tab 补全、Cursor 设置 |
| [官方-忽略] | https://cursor.com/cn/docs/reference/ignore-file | 索引、忽略文件 |
| [官方-Bugbot] | https://cursor.com/cn/docs/bugbot | Bugbot、评审、用量 |
| [官方-合规] | https://cursor.com/cn/docs/enterprise/compliance-and-monitoring | 隐私模式、云端代理 |
| [官方-Cloud] | https://cursor.com/cn/cloud | 云端智能体 |
| [VSC] | VS Code 官方简体中文语言包（`MS-CEINTL.vscode-language-pack-zh-hans`） | 通用 IDE 词汇、空格与省略号惯例 |

> 说明：官方中文文档（2026-11 查阅）本身存在多种译法并存的情况，例如 Agent 同时出现“智能体”“代理”“Agent”，Cloud Agents 同时出现“云端代理”“云端智能体”。本表在这些地方**有意统一**，取舍理由写在“说明”列。

## 1. 处理原则

1. **产品/品牌/功能专名保留英文**：Cursor、Composer、Bugbot、Tab（作为功能）、MCP、Max Mode、Auto、方案名（Free / Pro / Pro+ / Ultra / Teams / Business / Enterprise），以及模式名 Agent / Ask / Plan / Manual / Debug。
2. **通用界面动词与名词翻译**：Apply 应用、Accept 接受、Reject 拒绝、Context 上下文、Codebase 代码库、Models 模型、Rules 规则、Settings 设置。
3. **与 VS Code 官方中文语言包重叠的词，以 VS Code 语言包为准**（如 Terminal 终端、Keybindings 键盘快捷方式、Command Palette 命令面板），避免同一窗口内出现两种译法。
4. **字面语法一律不译**：`@Web`、`@Docs`、`@Codebase`、`@Terminals`、`/create-rule`、`.cursor/rules`、`mcp.json`、快捷键、占位符。

## 2. 术语表

| English term | 处理方式 | 统一译法 | 说明/示例 |
| --- | --- | --- | --- |
| Cursor | 保留 | Cursor | 品牌名。“Cursor Settings” → “Cursor 设置”[官方-Tab] |
| Agent（模式/功能名） | 保留 | Agent | **全项目不使用“智能体”“代理”**。模式切换器中 Agent 与 Ask、Plan 并列，官方已保留 Ask/Plan 英文（“Ask 模式”“Plan 模式”[官方-Ask][官方-Plan]），Agent 也保留才一致；官方中文文档对 Agent 有“智能体/代理/Agent”三种写法，我们统一为一种。示例：“Agent 模式”“打开 Agent 面板”（官方原文即“打开 Agent 面板”[官方-Plan]）。泛指的 “agents”（复数、非功能名）同样写作 “Agent”，如 “3 个 Agent 正在运行”。 |
| Agent panel / Agents Window | 保留 + 翻译 | Agent 面板 / Agent 窗口 | 官方有“智能体面板”“代理窗口”，按上条统一。 |
| Composer | 保留 | Composer | 3.x 中为 Cursor 自研模型名（如 “Composer 2.5”[官方首页模型表]）；旧版指多文件编辑面板，同样不译。 |
| Chat | 翻译 | 聊天 | “New Chat” → “新聊天”；“chat input” → “聊天输入框”[官方-提示]。作为 `@Chats` 提及语法时不译。 |
| Ask | 保留 | Ask | 模式名，正文写“Ask 模式”[官方-Ask]。 |
| Manual | 保留（模式名）/ 翻译（规则类型） | Manual / 手动 | 作为聊天模式名保留 “Manual”；规则类型 “Apply Manually” → “手动应用”[官方-规则]。 |
| Plan（模式） | 保留 | Plan | “Plan 模式”[官方-Plan]；计划文档本身 “plan” → “计划”；按钮 “Build” → “构建”。 |
| Plan（订阅方案） | 翻译 | 方案 | 与 Plan 模式区分。官方混用“方案/套餐”，统一为“方案”[官方-Max]。“Upgrade plan” → “升级方案”。 |
| Rules | 翻译 | 规则 | [官方-规则] |
| Project Rules | 翻译 | 项目规则 | [官方-规则] |
| User Rules | 翻译 | 用户规则 | [官方-规则] |
| Team Rules | 翻译 | 团队规则 | [官方-规则] |
| Rules for AI | 翻译 | AI 规则 | 旧版设置项名称，若 3.27.22 中仍存在则使用此译法。 |
| Always Apply / Apply Intelligently / Apply to Specific Files / Apply Manually | 翻译 | 始终应用 / 智能应用 / 应用于特定文件 / 手动应用 | 规则类型下拉菜单[官方-规则 help 页] |
| MCP | 保留 | MCP | 全称 “模型上下文协议 (MCP)”[官方-MCP]，界面一律只写 MCP。 |
| MCP Server | 保留 + 翻译 | MCP 服务器 | [官方-MCP] |
| MCP Tools | 保留 + 翻译 | MCP 工具 | [官方-MCP] |
| Tab（功能） | 保留 | Tab | 补全功能名，“Tab 补全”[官方-Tab]。按键 Tab 也不译。 |
| Background Agent | 保留 | Background Agent | 旧名，3.x 已更名 Cloud Agent。若 3.27.22 中残留，保留原文，不另造译名。 |
| Cloud Agent | 保留 | Cloud Agent | 官方有“云端代理/云端智能体”[官方-合规][官方-Cloud]，按 Agent 原则保留。下拉选项 “Local / Cloud” → “本地 / 云端”。 |
| Bugbot | 保留 | Bugbot | [官方-Bugbot] |
| Apply | 翻译 | 应用 | 按钮。“Apply to file” → “应用到文件”。 |
| Accept | 翻译 | 接受 | 按钮。 |
| Reject | 翻译 | 拒绝 | 按钮。 |
| Accept All | 翻译 | 全部接受 | 按钮，4 字。 |
| Reject All | 翻译 | 全部拒绝 | 按钮，4 字。 |
| Accept File / Reject File | 翻译 | 接受文件 / 拒绝文件 | |
| Undo / Keep | 翻译 | 撤销 / 保留 | Keep 在审查栏中指“保留更改”。 |
| Context | 翻译 | 上下文 | “context window” → “上下文窗口”；“context usage” → “上下文用量”[官方-提示] |
| Codebase | 翻译 | 代码库 | [官方-Agent]。`@Codebase` 语法不译。 |
| Models | 翻译 | 模型 | 设置页标签 “Models” → “模型”；“model picker” → “模型选择器”[官方-Max] |
| Auto | 保留 | Auto | 模型选择器中的自动选择选项，属产品功能名。 |
| Max Mode | 保留 | Max Mode | [官方-Max]，不写“最大模式”。 |
| Thinking | 翻译 | 思考 | 模型能力标签。 |
| Memories | 翻译 | 记忆 | 官方中文文档未查到对应页面，**待核实**。 |
| Notepads | 翻译 | 记事本 | 旧版 Beta 功能，若存在则使用。 |
| Indexing | 翻译 | 索引 | 设置页标签 “Indexing” → “索引”；“Codebase Indexing” → “代码库索引”；“Reindex/Resync” → “重新索引”[官方-忽略]。 |
| Docs | 翻译 | 文档 | 设置中的文档源；`@Docs` 语法不译。 |
| Web | 翻译 | 网页 | “Web search” → “网页搜索”[官方-Agent]；`@Web` 语法不译。 |
| Checkpoint | 翻译 | 检查点 | [官方-Agent] |
| Restore / Restore Checkpoint | 翻译 | 还原 / 还原检查点 | 官方：“然后还原，将所有文件恢复到该状态”[官方-Agent]。Revert → “回退”[官方-Plan]。 |
| Diff | 保留（正文）/ 翻译（标签） | diff / 差异 | 正文与提及沿用官方“diff”（小写）[官方-提示]；独立标签或标题用“差异”，如 “View Diff” → “查看差异”。见待对齐 Q4。 |
| Review | 翻译 | 审查 | “Review changes” → “审查更改”[官方首页]。Bugbot 的 PR review 官方用“评审”[官方-Bugbot]，Bugbot 相关文案可用“评审”，其余统一“审查”。 |
| Changes | 翻译 | 更改 | 与 VS Code 一致。 |
| Terminal | 翻译 | 终端 | [VSC][官方-Agent] |
| Usage | 翻译 | 用量 | [官方-Bugbot][官方-提示] |
| Pricing | 翻译 | 价格 | “Models & Pricing” → “模型与价格”[官方首页] |
| Free / Hobby / Pro / Pro+ / Ultra / Teams / Business / Enterprise | 保留 | 原文 | 方案名不译。“Pro plan” → “Pro 方案”。 |
| On-demand usage | 翻译 | 按需用量 | [官方-Bugbot] |
| Spend limit | 翻译 | 支出限额 | [官方-合规] |
| Settings | 翻译 | 设置 | |
| Cursor Settings | 保留 + 翻译 | Cursor 设置 | [官方-Tab] |
| General | 翻译 | 常规 | 设置页标签，与 VS Code “常规”一致。 |
| Beta | 保留 | Beta | 设置页标签，不写“测试版”。 |
| Keybindings / Keyboard Shortcuts | 翻译 | 键盘快捷方式 | 与 [VSC] 一致，不写“快捷键绑定”。 |
| Privacy Mode | 翻译 | 隐私模式 | [官方-合规]；“Legacy Privacy Mode” → “旧版隐私模式”[官方-Bugbot] |
| @-mentions | 翻译 | @ 提及 | [官方-提示] |
| Symbols | 翻译 | 符号 | |
| Files & Folders | 翻译 | 文件和文件夹 | [官方-提示] |
| Git | 保留 | Git | |
| PR / Pull Request | 保留 | PR | 全称出现时写 “拉取请求 (PR)”，与 [VSC] GitHub 扩展一致；按钮只写 PR。 |
| Customize | 翻译 | 自定义 | 侧边栏入口[官方-MCP] |
| Plugins / Marketplace | 翻译 | 插件 / 插件市场 | [官方-MCP] |
| Skills | 翻译 | 技能 | [官方-提示] |
| Subagents | 保留 + 翻译 | 子 Agent | 官方为“子智能体”，按 Agent 原则调整。 |
| Hooks | 翻译 | 钩子 | [官方-合规] |
| Queue / Send now | 翻译 | 排队 / 立即发送 | [官方-Agent] |
| Run / Skip / Allow / Deny | 翻译 | 运行 / 跳过 / 允许 / 拒绝 | 工具/命令确认按钮。注意 Deny 与 Reject 同译“拒绝”，两者不会同屏出现在同一操作上；若同屏冲突，Deny 改“不允许”。 |
| Command Palette | 翻译 | 命令面板 | [VSC] |
| Sign in / Log out | 翻译 | 登录 / 退出登录 | [VSC] |
| Token(s) | 保留 | token | 小写，官方正文即写 “token”[官方-提示]。 |

## 3. 翻译风格规范

### 3.1 语气与人称
- 简洁、中性、直接，不加“请您”“亲”等客套词；能用动词开头就用动词开头（“打开设置”而不是“点击此处可以打开设置”）。
- **统一用“你”，不用“您”**。理由：Cursor 官方中文文档的新页面以“你”为主（两者混用，我们统一）；面向开发者的工具用“你”更自然。VS Code 中文语言包存在“你/您”并存的情况，以本规范为准，**不跟随**语言包逐条改动 VS Code 核心字符串（VS Code 核心 UI 不在本项目范围）。
- 不用感叹号，错误信息不带情绪（“无法连接到 MCP 服务器”而不是“糟糕！连接失败了！”）。

### 3.2 中英文之间的空格（遵循 VS Code zh-hans 语言包惯例）
- **中文与英文单词、数字、占位符之间各加一个半角空格**：“打开 Agent 面板”“已应用 3 个更改”“在 {0} 中打开”。
- 中文与全角标点之间、英文与全角标点之间**不加**空格：“已连接 MCP。”
- 数字与单位：数字与英文单位之间加空格（“4 MB”“200k token”）；百分比和度数不加（“75%”）。
- 中文与快捷键之间加空格：“按 Ctrl+Shift+J 打开 Cursor 设置”。
- 英文原文无空格的专名保持原样（“Pro+”“Max Mode”“@Docs”）。

### 3.3 标点
- 中文句子使用**全角**标点：，。；：？！“”（）
- 下列情况保留**半角**：代码、路径、命令、占位符、URL、版本号（3.27.22）、快捷键中的 `+`、命令面板分类前缀的冒号（`Cursor: 打开设置`，与 VS Code “文件: 打开文件夹...”一致，冒号后一个空格）。
- 括号内全为英文/数字时用半角括号并在外侧加空格：“模型上下文协议 (MCP)”（与官方一致）。
- 引号：中文用“”；界面元素名称在句中引用时用“”而不是【】或「」。
- **省略号**：按钮/菜单项末尾表示“会打开对话框”的省略号保持与源字符串相同的三个半角点 `...`（与 VS Code 语言包一致，如“打开文件夹...”）；正文中的省略用中文“……”。表示“进行中”的状态（Generating...）译为“正在生成...”。
- 句末：按钮、菜单项、标签、标题**不加**句号；完整句子的提示/错误信息加句号。

### 3.4 不得改动的内容（硬性要求，违反即“阻断”级缺陷）
- 占位符：`{0}`、`{1}`、`%s`、`%d`、`${name}`、`{count}` 等，必须原样保留且**数量一致**；可以调整语序，但不得增删、改名、翻译。
- 快捷键：`Ctrl+I`、`Ctrl+Shift+J`、`Shift+Tab` 等；键名不译（不写“控制键”）。
- 代码与语法：反引号内容 `` `code` ``、`@` 提及标记、`/` 命令、文件名与路径、JSON 键、环境变量、URL。
- HTML/Markdown 标记、`&` 助记符（如 `&&File`）：保留标记，助记符放到中文后用括号形式，遵循 VS Code 做法（如“文件(&&F)”），具体由开发人员一确认（见待对齐 Q3）。
- 大小写敏感名词：Cursor、MCP、PR、Git、GitHub、Bugbot、Max Mode、Pro+、Composer、Tab 按原大小写书写；token、diff 小写。

### 3.5 文案长度上限
| 类型 | 上限 | 示例 |
| --- | --- | --- |
| 按钮 | ≤ 6 个汉字（英文专名按 2 个字符约 1 个汉字计） | 全部接受、还原检查点 |
| 标签页/设置分区标题 | ≤ 6 个汉字 | 常规、模型、规则、索引 |
| 菜单项、命令面板命令名（不含 `Cursor:` 前缀） | ≤ 12 个汉字 | Cursor: 打开 Cursor 设置 |
| 输入框占位符 | ≤ 20 个汉字 | 让 Agent 构建、修复或回答... |
| 提示/Toast/错误信息 | ≤ 1 句（必要时 2 句，第二句给出操作） | 无法连接到 MCP 服务器。请检查配置。 |
| 工具提示（tooltip） | ≤ 1 句 | |
如译文超长导致截断，优先精简措辞，**不得**通过删除含义（如省略否定词）来缩短。

### 3.6 数字、时间与单位
- 使用阿拉伯数字；千分位不加逗号（≤ 4 位）或按源字符串格式。
- 复数变化直接去掉：“1 file / 2 files” 均译“{0} 个文件”。
- 时间相对表达：“2 minutes ago” → “2 分钟前”；“just now” → “刚刚”。
- 货币保留 `$` 与原格式（“$20/月”）。

## 4. 待对齐（需开发人员一确认）

| # | 问题 | 我的建议 |
| --- | --- | --- |
| Q1 | **Agent 是否保留英文**：官方中文文档正文大量使用“智能体”。本表选择全项目保留 “Agent”。**已定（开发组长 2026-11-03 拍板）：保留 Agent。** 开发人员一请确认补丁能否做全局一致替换（含 Agent 面板、子 Agent、Cloud Agent）。 | 保留 Agent |
| Q2 | 补丁作用于哪一层：`out/nls.messages.json` / 语言包扩展，还是直接改打包后的 JS（`workbench.desktop.main.js` 等）？这决定 Cursor 专有字符串（非 VS Code nls 字符串）是否能被定位，以及是否会触发“安装似乎已损坏”的完整性警告。 | 请给出方案和受影响文件清单 |
| Q3 | 菜单助记符 `&&` 与命令面板英文别名：汉化后命令面板能否仍用英文搜索（VS Code 语言包会保留英文别名）？ | 必须保留英文可搜索 |
| Q4 | Diff 的处理：正文保留 “diff”、标签用“差异”是否可接受，或全部统一为“差异”？ | 先按本表执行，测试反馈后定 |
| Q5 | `@` 提及菜单中的项目名（Files & Folders、Docs、Web、Codebase、Terminals）：显示标签翻译，插入到输入框的 token（`@Web` 等）保持英文。补丁能否区分“显示文本”和“插入文本”？ | 区分；不能区分则整项保留英文 |
| Q6 | 来自服务端的字符串（模型列表、方案/用量提示、部分错误信息、更新日志）无法在本地补丁中翻译，是否明确排除？ | 排除，见 p0-scope.md |
| Q7 | Memories、Notepads、Background Agent、Rules for AI 在 3.27.22 中是否仍存在？请从实际字符串中确认，不存在的从术语表移除。 | 以实际字符串为准 |
| Q8 | 开关类按钮（On/Off、Enabled/Disabled）译为“开/关”还是“已启用/已禁用”？ | 开关控件旁“开/关”，状态文字“已启用/已禁用” |

