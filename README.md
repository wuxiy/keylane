# Keylane

Keylane 是面向个人常用内网站点的浏览器登录入口。目标是在扩展中选择站点后，打开登录页、生成或读取凭据、填充表单并提交；特殊站点可使用自定义 JavaScript 登录。

**当前状态：V0.1 开发版已可加载，完整人工验收仍在进行。** `extension/` 是实际的 Chrome 扩展；`prototype/` 仅用虚构数据演示界面，不参与登录。

## 本地安装

1. 使用 Chrome 138 或更新版本，打开 `chrome://extensions` 并开启“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择本仓库的 `extension/` 目录。
3. 点击 Keylane 图标打开入口，或打开扩展的“选项”管理站点。保存站点后，按站点点击“授权”并确认 Chrome 权限提示。
4. 使用自定义 JS 的站点，还需在该扩展的 Chrome 详情页开启 **Allow User Scripts**，并在 Keylane 管理页逐站审阅、启用脚本。

配置和导出文件包含明文密码与脚本。仅添加自己信任的站点，并自行保管导出文件。

## 打包与更新

安装 Python 3 后运行 `npm run package`，生成 `dist/keylane-0.1.0.zip`、校验文件和固定安装目录 `dist/keylane/`。ZIP 内仅包含扩展运行文件，不含测试、原型、配置或导出文件。安装打包版时，在 Chrome 扩展管理页加载 `dist/keylane/`；在另一台电脑上，先解压 ZIP，再加载包含 `manifest.json` 的目录。

后续更新代码后重新运行打包命令，并在 Chrome 扩展管理页点击 Keylane 的重新加载按钮。保持相同安装路径可保持同一个扩展 ID 和已有本地配置；移动目录或移除扩展前，请先手动导出配置。

## 验证

本地验证使用 Node.js 24。在仓库根目录运行 `npm ci`、`npm run check`、`npm test`。浏览器测试使用本地虚构站点与隔离 Chrome 配置，运行 `npm run test:browser`；如 Chrome 不在系统默认路径，设置 `KEYLANE_CHROME_BIN`。浏览器测试不替代真实 Chrome 权限弹窗和目标内网站点的人工验收。

- [产品文档](docs/PRODUCT.md)：使用场景、首版范围和验收标准
- [技术文档](docs/TECHNICAL.md)：扩展架构、数据与执行边界
- [设计规范](DESIGN.md)：视觉规则、界面分工和后续迭代依据
- [交互原型](prototype/index.html)：切换 Popup、Side Panel、管理页并试用关键流程
- [实施与验收清单](docs/ACCEPTANCE_PLAN.md)：已确认的通过条件与阶段计划
- [验证记录](docs/VERIFICATION.md)：已运行检查和待人工确认项
- [AGENTS.md](AGENTS.md)：后续协作约定

原型是零依赖的静态页面：直接用浏览器打开 `prototype/index.html`。页面里的保存、授权、登录和导入仅作演示，刷新后恢复样例。

定位：本地使用、手动配置站点、手动导入导出；不依赖服务端。
