# Keylane

> 面向个人常用内网站点的 Chrome 扩展：保存登录规则，一键打开、填充并提交。

在一个入口管理站点地址、凭据和登录动作，减少重复打开页面、输入密码的操作。配置保存在本机，不依赖服务端。

> [!NOTE]
> 当前为 **V0.1 开发版**，可通过 Chrome 加载已解压扩展使用，完整人工验收尚未完成。`extension/` 是实际扩展；`prototype/` 是使用虚构数据的交互演示。已运行检查与待验收范围见 [验证记录](docs/VERIFICATION.md)。

## 能做什么

- **快速进入站点**：Popup 搜索与启动、Side Panel 常驻入口、完整管理页编辑配置。
- **配置登录规则**：站点名称、地址、分组、路径约束与表单 CSS 选择器；支持新标签页登录、匹配当前页登录和仅填充。
- **生成动态凭据**：固定密码、秒／毫秒时间戳 Base64、自定义 JS 返回用户名和密码。
- **调用页面 JS**：为特殊站点配置页面登录脚本，调用网页已有函数。
- **手动迁移配置**：JSON 导出、导入预览与冲突处理；导入后的脚本统一停用，逐站审阅后再启用。

## 快速开始

### 安装

安装要求为 **桌面版 Chrome 138 或更新版本**；浏览器自动化已在 Chrome 154 运行，最低版本 138 尚待实机验证。直接加载源码不需要安装 Node.js 或执行构建。

1. 将本仓库下载或克隆到本机，保留一个固定目录。
2. 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择仓库中的 **`extension/`** 目录，其中应包含 `manifest.json`。
4. 点击 Keylane 工具栏图标，选择“管理配置”；也可从 Chrome 扩展详情页打开“扩展程序选项”。

### 配置首个站点

在管理页点击“新增站点”，填写自己的登录地址和规则：

| 配置 | 填写方式 |
| --- | --- |
| 名称、分组 | 用便于搜索的名称；默认分组为“常用”。 |
| 登录地址 | 完整的 `http` 或 `https` URL，可含端口。 |
| 路径约束 | 可选；例如 `/login` 匹配该路径及其子路径，不匹配 `/login-other`。 |
| 凭据来源 | 首次可选“固定密码”，填写该站点的用户名、密码。 |
| 登录动作 | 选“标准表单”，填写用户名、密码、提交按钮的 CSS 选择器。 |
| 自动提交 | 默认开启；取消“填充后自动提交”可先检查填充结果，提交按钮选择器可留空。 |

仓库的 [本地测试页](tests/fixtures/login.html) 使用 `#username`、`#password`、`#submit` 作为三个选择器。实际站点需按其页面结构配置，每个选择器应唯一命中目标元素。

保存配置后，回到入口点击站点的“授权”，确认 Chrome 的站点访问提示，再点击“进入”。也可在管理页点击“试用登录”。保存配置本身不会申请站点权限；授权被拒绝时，配置仍保留。

> [!IMPORTANT]
> “已填充”表示尚未提交；“已提交”表示提交动作已发出，**不代表服务器认证成功**，请以目标页面确认结果。Keylane 不自动重试或重复提交。

## 动态密码与脚本

**时间戳 Base64** 无需写脚本：选择该凭据来源，再选择秒或毫秒。扩展在目标页面就绪后，将时间戳的十进制字符串编码为 Base64；Base64 是编码，不是加密。

自定义脚本需要同时满足两个条件：在 Chrome 的 Keylane 详情页开启 **Allow User Scripts（允许用户脚本）**，并在 Keylane 站点配置中勾选“我已检查此站点的脚本并允许主动执行”。脚本只在用户主动发起登录时执行。

**凭据脚本**以函数体形式填写，返回字符串类型的 `username` 和 `password`。以下为测试中的虚构示例：

```js
return { username: "script-user", password: btoa("script-value") };
```

**页面登录脚本**可读取本次凭据 `ctx.username`、`ctx.password`。若目标页面提供 `window.login`，可填写：

```js
window.login(ctx.username, ctx.password);
return { submitted: true };
```

页面脚本与网页共享执行环境，网页可见本次传入的凭据，请逐站检查代码。脚本契约和执行边界见 [技术文档](docs/TECHNICAL.md)。

## 配置保存与迁移

> [!WARNING]
> 静态密码与脚本源码以明文保存在本地；JSON 导出文件也包含这些内容。密码在界面中默认遮挡不等于存储加密。请自行保管导出文件，不要提交到 Git 仓库。

在管理页打开“导入与导出”：

1. **原电脑**：点击“导出配置”，确认后保存 JSON 文件。
2. **新电脑**：安装扩展，选择 JSON 文件，检查站点、域名、脚本和冲突选项后确认导入。
3. **恢复使用**：对尚未授权的站点重新授权；逐站审阅并启用需要的脚本。浏览器权限和临时登录任务不会随配置导出。

V0.1 面向个人固定站点、每站一个账号，采用手动配置与迁移。目前不支持云同步、主密码、团队共享、验证码／OTP 自动处理、跨 origin 的 SSO，以及 iframe 或 Shadow DOM 内的表单操作。

## 打包与更新

在仓库根目录运行，需安装 Node.js／npm 和 Python 3；打包不需要安装 npm 依赖：

```bash
npm run package
```

当前版本生成以下产物，版本号取自扩展清单：

| 产物 | 用途 |
| --- | --- |
| `dist/keylane/` | 固定的本机安装目录，在 Chrome 中加载此目录。 |
| `dist/keylane-0.1.0.zip` | 仅含扩展运行文件；另一台电脑解压后加载包含 `manifest.json` 的目录。 |
| `dist/keylane-0.1.0.sha256` | ZIP 的 SHA-256 校验值。 |

ZIP 不包含测试、原型或本地账号配置。更新后重新打包，再在 `chrome://extensions` 点击 Keylane 的重新加载按钮；直接加载源码的用户更新后重新加载即可。保持原安装路径可保持扩展 ID 和已有本地配置；移动目录或移除扩展前，先导出配置。

## 开发与验证

扩展使用 **Manifest V3、原生 JavaScript ES modules 与 CSS**，没有前端构建步骤。站点配置存于 `chrome.storage.local`，临时任务状态存于 `chrome.storage.session`；Service Worker 协调页面匹配、凭据生成与脚本执行。

开发验证使用 Node.js 24、npm 和本机 Chrome。先在仓库根目录安装开发依赖：

```bash
npm ci
```

| 命令 | 用途 |
| --- | --- |
| `npm run check` | 扩展模块与浏览器测试脚本的语法检查。 |
| `npm test` | 配置、URL 匹配、时间戳与导入导出的纯函数测试。 |
| `npm run test:browser` | 启动本地虚构测试页，在隔离 Chrome 配置中验证扩展流程。 |
| `npm run package` | 生成固定安装目录、ZIP 与校验文件。 |

macOS 默认使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。其他安装位置可通过环境变量 `KEYLANE_CHROME_BIN` 指定 Chrome 可执行文件的完整路径。

[2026-09-30 的验证记录](docs/VERIFICATION.md)包含 5 项纯函数测试和 Chrome 154 下的 19 项浏览器检查通过结果。浏览器正向注入测试使用临时副本预授予本地主机权限；正式扩展仍按站点申请权限。真实权限弹窗、原生 Popup／Side Panel 操作、Chrome 138 兼容性和目标站点登录结果仍需独立验收。

### 代码入口

| 路径 | 职责 |
| --- | --- |
| [extension/core.js](extension/core.js) | 配置校验、完整 origin／路径匹配、动态密码、导入导出。 |
| [extension/background.js](extension/background.js) | 登录任务协调与 Chrome API 调用，一次仅运行一个任务。 |
| [extension/inject.js](extension/inject.js) | 页面探针、表单填充与提交。 |
| [extension/ui.js](extension/ui.js) | Popup、Side Panel 与管理页共享界面。 |
| [tests/](tests/) | 纯函数测试、浏览器测试和虚构登录页。 |
| [scripts/package.py](scripts/package.py) | 运行文件打包。 |

## 文档与原型

| 文档 | 内容 |
| --- | --- |
| [产品文档](docs/PRODUCT.md) | 使用场景、首版范围与产品边界。 |
| [技术文档](docs/TECHNICAL.md) | 架构、数据契约、权限、脚本与状态机。 |
| [设计规范](DESIGN.md) | 视觉、交互与后续迭代依据。 |
| [交互原型](prototype/index.html) | Popup、Side Panel、管理页及关键状态演示。 |
| [实施与验收清单](docs/ACCEPTANCE_PLAN.md) | 已确认的实施顺序与可验证通过条件。 |
| [验证记录](docs/VERIFICATION.md) | 已运行检查、验证限制与待验收项。 |
| [协作约定](AGENTS.md) | 实现边界、文档同步与验证要求。 |

原型是零依赖静态页面，直接用浏览器打开 `prototype/index.html`。其中保存、授权、登录和导入仅作演示，刷新后恢复虚构样例。
