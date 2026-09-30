# Keylane 技术文档

状态：**V0.1 开发版已落地，完整人工验收待完成**。`extension/manifest.json` 指定 Chrome 桌面版 Manifest V3 和 `minimum_chrome_version: "138"`。Chrome 135 起提供按需 `chrome.userScripts.execute()`，Chrome 138 起使用扩展级“Allow User Scripts”开关。浏览器自动化已在 Chrome 154 验证脚本开关的关闭与开启；最低版本 138 尚未实机验证。见 [Chrome userScripts 文档](https://developer.chrome.com/docs/extensions/reference/api/userScripts)。

## 1. 组件与职责

```text
Popup / Side Panel / 管理页（扩展页面）
              │ 站点配置、登录命令、导入导出
              ▼
Service Worker（协调器）
  ├─ 读取单个站点、校验 URL 和权限
  ├─ 打开/定位 Tab，跟踪一次性登录任务
  ├─ 生成内置动态密码
  └─ 发起脚本执行并汇报状态
              │
              ├─ chrome.scripting.executeScript：打包的表单填充代码
              └─ chrome.userScripts.execute：用户编写的 JS
                              ▼
                         目标站点页面
```

当前实现使用原生 JavaScript ES modules 和 CSS，无前端构建步骤或服务端。`extension/core.js` 负责配置与 URL 契约，`extension/background.js` 协调登录，`extension/inject.js` 提供打包的页面探针和表单动作，`extension/ui.js` 共享三个界面。Service Worker 可被 Chrome 暂停，因此任务 ID、站点 ID、Tab ID、阶段与截止时间保存在 `chrome.storage.session`，不保存密码；重启后未结束任务显示“结果未确认”，不自动重试。当前任务执行为一次一个，以防重复提交。见 [扩展 Service Worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)。

## 2. 数据契约

本地持久数据放在一个版本化的 `chrome.storage.local` 文档中，不使用 `chrome.storage.sync`。以下是逻辑结构，字段校验与迁移须随实现固定：

```ts
type Credential =
  | { type: "static"; username: string; password: string }
  | { type: "timestampBase64"; username: string; unit: "milliseconds" | "seconds" }
  | { type: "script"; code: string };

type LoginAction =
  | {
      type: "form";
      usernameSelector: string;
      passwordSelector: string;
      submitSelector: string;
      submit: boolean;
    }
  | { type: "pageScript"; code: string };

interface Site {
  id: string;
  name: string;
  group?: string;
  loginUrl: string;
  match: { origin: string; pathPrefix?: string };
  credential: Credential;
  action: LoginAction;
  scriptsEnabled: boolean;
}

interface KeylaneData {
  schemaVersion: 1;
  sites: Site[];
}
```

`origin` 用 URL 解析结果规范化，包含协议、主机、端口；路径约束按路径段边界匹配，不能用模糊子串匹配。暂不支持跨 origin 的登录跳转。站点列表可见名称与 URL；静态密码在编辑页默认遮挡，用户主动操作后才显示。

用户已接受本地明文：`storage.local` 中的静态密码及 JS 源码不加密，不能把该存储称为 Vault。启动时调用 `chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"})`，使内容脚本不能直接读取整个配置；扩展页面和 Service Worker 仍可访问。见 [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)。

## 3. 权限与页面匹配

- 必需 API 权限为 `storage`、`tabs`、`scripting`、`sidePanel`、`userScripts`。`userScripts` 的可用性仍取决于用户开关。
- Manifest 声明 `http://*/*` 与 `https://*/*` 为 `optional_host_permissions`，仅在用户点击“授权”或首次登录时申请目标主机访问；保存配置不申请权限，也不申请全局已授予主机权限。Chrome [权限说明](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) 与 [运行时申请 API](https://developer.chrome.com/docs/extensions/reference/api/permissions) 是这一行为的依据。
- 登录前及注入前均读取目标 Tab 当前 URL，核对完整 origin 和可选路径前缀；发现跨站重定向立即停止。先用不含凭据的探针确定目标 documentId，随后把含凭据的注入固定到该文档，并在脚本开头再次校验 `location`。Chrome 的主机匹配模式与应用内 URL 校验是两道边界，路径在主机权限中会被忽略；实际授予范围以浏览器权限弹窗为准。见 [匹配模式](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns) 与 [脚本注入目标](https://developer.chrome.com/docs/extensions/reference/api/scripting)。
- 只在用户主动发起登录时注入，默认目标为顶层 frame。子 frame、浏览器内部页与不支持的 URL 明确报错。

## 4. 登录状态机

`idle → permission-check → opening/waiting → url-check → credential-ready → executing → filled/submitted | failed`

1. 为一次点击创建任务 ID；处理当前 Tab 或新 Tab。等待页面加载和目标元素出现，使用有界等待与明确超时，不靠固定睡眠时间保证页面就绪。探针先确认当前文档和表单目标，返回 documentId。
2. 在生成密码前校验 URL。固定密码从该站点配置读取；动态密码在目标就绪后使用 `Date.now()`，毫秒直接取值，秒取 `Math.floor(Date.now() / 1000)`，再对十进制字符串做 Base64。Base64 是编码，不是加密。
3. 标准表单由打包脚本通过 `chrome.scripting.executeScript()` 在隔离世界执行：验证 selector 只命中预期元素，设置原生 `value`，派发 `input`/`change` 事件；提交时优先点击已配置按钮。提交动作只执行一次。
4. 返回状态是“已填充”“已提交”或具体失败。服务器认证成功需要页面专有判断，本版不做泛化成功检测。不得把密码、完整配置或执行脚本结果中的敏感值写入日志。

## 5. 自定义 JS 契约

Manifest V3 不允许在普通扩展上下文用 `eval`、`new Function` 或 `chrome.scripting.executeScript` 的字符串执行用户代码；用户编写的 JS 走 `chrome.userScripts.execute({ js: [{ code }], target: { tabId }, world })`。该 API 支持代码字符串且 Chrome 135+ 可按需执行。见 [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts) 与 [MV3 安全迁移说明](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)。

- **凭据脚本**在 `USER_SCRIPT` world 执行，约定以函数体形式编写，返回 `{ username: string, password: string }`。例如：`return { username: "demo", password: btoa(String(Date.now())) };`。扩展负责包裹成可执行函数，校验返回值；不要向脚本提供其他站点配置。
- **页面登录脚本**在 `MAIN` world 执行，适用于调用 `window.login(...)` 等网页已有函数。脚本可读取本次 `ctx.username` 与 `ctx.password`，并返回 `{ submitted: true }` 表示动作已发出。示例：`window.login(ctx.username, ctx.password); return { submitted: true };`。扩展以安全的 JSON 序列化构造本次 `ctx`，将注入目标固定到已检查的 documentId，并在运行脚本正文前再次检查 URL。`MAIN` world 与网页共享执行环境，网页可以看到本次传入的凭据；只允许用户明确配置的可信站点使用。
- 两类脚本均只在一次登录命令中执行。脚本在导入后默认禁用，用户逐站阅读并开启；脚本异常或 User Scripts 开关关闭时失败并显示原因，不自动退回到不受控的执行方式。
- 不给用户脚本开放扩展消息通道、全量存储或其他站点凭据；禁止从远程地址下载 JS 再执行。若脚本自身访问网络或网页 API，其行为由用户负责，界面需提示其拥有页面执行能力。

## 6. 导入导出

导出格式为 `{ schemaVersion: 1, exportedAt, sites }` 的 UTF-8 JSON。导出包含明文静态密码和 JS 源码，不包含浏览器权限、临时任务或使用记录；文件名不含站点名称/账号。导入先做格式版本、URL、ID、selector、脚本大小等校验，再展示预览和冲突选项，最后一次写入。导入时统一将 `scriptsEnabled` 设为 `false`；未获权限的站点保持“待授权”。无效文件不部分写入。

## 7. 验证顺序

1. 纯函数：URL 匹配含协议/端口/路径边界；秒与毫秒时间戳；导入校验与冲突处理。
2. 本地测试页：原生表单、事件驱动表单、页面 `window.login`、缺失元素、延迟出现、跳转到其他 origin。
3. 浏览器扩展实测：权限弹窗与拒绝、Popup/Side Panel/管理页、User Scripts 开关关闭、从导出文件迁移到独立浏览器配置。

所有检查都用虚构凭据。实际检查结果和仍待人工验收的范围记录在 [验证记录](VERIFICATION.md)；静态检查、纯函数测试或扩展浏览器自动化都不能替代真实站点登录结果。
