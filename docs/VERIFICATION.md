# Keylane V0.1 验证记录

状态：**开发版可加载；尚未完成 [A01–A15 全量验收](ACCEPTANCE_PLAN.md)**。记录截至 2026-09-30，只使用 `127.0.0.1` 本地测试页和虚构凭据。

## 已运行

| 层级 | 命令或环境 | 可观察结果 |
| --- | --- | --- |
| 静态检查 | `npm run check` | 扩展四个 JavaScript 模块与浏览器测试脚本语法检查通过。 |
| 纯函数 | `npm test` | 5 项通过、0 失败、0 跳过：完整 origin 和路径段匹配、配置校验、两种时间戳、导入冲突、导出结构。 |
| 打包 | `npm run package`；ZIP 完整性及逐文件比对 | 11 个运行文件；ZIP、`dist/keylane/` 与 `extension/` 内容相同，清单仍只声明可选主机权限。SHA-256 写入 `dist/keylane-0.1.0.sha256`。 |
| 浏览器自动化 | `npm run test:browser`；Chrome 154、两个隔离配置、本地虚构 HTTP 页 | 19 项通过：配置新增／编辑／删除及失败保留草稿、固定密码和单次提交、仅填充、当前页匹配、秒级动态密码、跨端口跳转、页面重绘、延迟与缺失元素、并发命令、脚本开关、骨架／读取失败／5 秒超时、导出、冲突导入和跨配置导入。 |
| 设计检查 | `node "$HOME/.agents/skills/impeccable/scripts/detect.mjs" --json extension/popup.html extension/sidepanel.html extension/options.html extension/styles.css extension/ui.js tests/fixtures/login.html` | 0 项未处理发现；三个扩展 HTML 的纸色背景依 `DESIGN.md` 使用了文件范围的 `cream-palette` 例外。 |

浏览器自动化为正向注入测试临时复制扩展，并仅在该临时副本中预授予 `http://127.0.0.1/*`。正式 `extension/manifest.json` 仍只声明可选主机权限。第二个隔离配置加载正式清单，已验证导入后没有主机权限且登录被拒绝。**这个测试不能证明 Chrome 权限弹窗中用户实际同意、拒绝或撤销后的交互。**

## 尚待独立验收

- **A01–A04：** 虚构 `https` 站点的界面配置、搜索和完整空态、快速读取不闪骨架、真实权限弹窗的同意／拒绝／撤销，以及 Popup／Side Panel 作为浏览器原生面板的操作。
- **A05–A11：** 更多路径与协议不匹配样例的浏览器注入检查、页面关闭／浏览器内部页、脚本语法错误与非法返回值、Service Worker 暂停或扩展重载后的未知结果、Chrome 138 实机兼容性。
- **A12–A15：** 导入所有坏文件类型与冲突选项的完整界面检查、迁移后逐站重新授权和启用脚本、键盘与减少动态效果检查。服务器认证成功不属于本版自动判定范围。

这些未验收项不应被 `npm` 命令通过或原型演示替代；完成时需在 [验收清单](ACCEPTANCE_PLAN.md) 中逐项勾选并记录对应输入与结果。
