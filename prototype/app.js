const demoSites = [
  {
    id: "nas", name: "NAS 文件中心", loginUrl: "https://nas.example/login",
    match: { origin: "https://nas.example", pathPrefix: "/login" },
    group: "常用", permission: true, scriptsEnabled: false,
    credential: { type: "static", username: "demo-user", password: "demo-only" },
    action: { type: "form", usernameSelector: "#username", passwordSelector: "#password", submitSelector: "button[type=submit]", submit: true },
  },
  {
    id: "ops", name: "工单系统", loginUrl: "https://ops.example/login",
    match: { origin: "https://ops.example", pathPrefix: "/login" },
    group: "常用", permission: true, scriptsEnabled: false,
    credential: { type: "timestampBase64", username: "demo-ops", unit: "seconds" },
    action: { type: "form", usernameSelector: "#account", passwordSelector: "#secret", submitSelector: "#login", submit: true },
  },
  {
    id: "monitor", name: "监控平台", loginUrl: "https://monitor.example/login",
    match: { origin: "https://monitor.example", pathPrefix: "/login" },
    group: "常用", permission: true, scriptsEnabled: false,
    credential: { type: "static", username: "demo-monitor", password: "demo-only" },
    action: { type: "form", usernameSelector: "#user", passwordSelector: "#pass", submitSelector: "#sign-in", submit: true },
  },
  {
    id: "deploy", name: "发布平台", loginUrl: "https://deploy.example/signin",
    match: { origin: "https://deploy.example", pathPrefix: "/signin" },
    group: "开发", permission: true, scriptsEnabled: true,
    credential: { type: "script", code: 'return { username: "demo", password: btoa(String(Date.now())) };' },
    action: { type: "pageScript", code: "window.login(ctx.username, ctx.password); return { submitted: true };" },
  },
  {
    id: "finance", name: "财务系统", loginUrl: "https://finance.example/login",
    match: { origin: "https://finance.example", pathPrefix: "/login" },
    group: "办公", permission: false, scriptsEnabled: false,
    credential: { type: "static", username: "demo-finance", password: "demo-only" },
    action: { type: "form", usernameSelector: "#username", passwordSelector: "#password", submitSelector: "#submit", submit: true },
  },
];

const state = {
  surface: "popup",
  view: "sites",
  sites: structuredClone(demoSites),
  filter: "",
  selectedId: "nas",
  draft: structuredClone(demoSites[0]),
  task: null,
  taskToken: 0,
  notice: null,
  showPassword: false,
  importPreview: false,
  exportPreview: false,
  formError: "",
  deleteCandidate: null,
};

const app = document.querySelector("#app");
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const svg = (name, small = false) => `<svg class="icon${small ? " small" : ""}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const siteHost = (site) => {
  try { return new URL(site.loginUrl).host; } catch { return "无效地址"; }
};
const modeLabel = (site) => ({
  static: "固定密码", timestampBase64: "时间戳", script: "自定义 JS",
})[site.credential.type] || "未配置";
const usesScript = (site) => site.credential.type === "script" || site.action.type === "pageScript";
const siteState = (site) => {
  if (!site.permission) return ["需授权", "warning"];
  if (usesScript(site) && !site.scriptsEnabled) return ["脚本未启用", "warning"];
  return ["就绪", "ready"];
};
const filteredSites = () => {
  const term = state.filter.trim().toLocaleLowerCase();
  return state.sites.filter((site) => !term || `${site.name} ${siteHost(site)} ${site.group}`.toLocaleLowerCase().includes(term));
};
const currentSite = () => state.sites.find((site) => site.id === "nas");
const activeSite = () => state.sites.find((site) => site.id === state.selectedId);
const makeDraft = (site) => structuredClone(site || {
  id: `site-${Date.now()}`, name: "", loginUrl: "", match: { origin: "", pathPrefix: "" },
  group: "常用", permission: false, scriptsEnabled: false,
  credential: { type: "static", username: "", password: "" },
  action: { type: "form", usernameSelector: "", passwordSelector: "", submitSelector: "", submit: true },
});

function renderBrand(short = false) {
  return `<div class="brand"><span class="brand-mark" aria-hidden="true">${svg("key")}</span><span class="brand-word">Keylane</span>${short ? "" : '<span class="brand-sub">内网入口 · 一键直达</span>'}</div>`;
}

function renderSearch() {
  return `<label class="search-box">
    ${svg("search")}<span class="sr-only">搜索站点</span>
    <input class="search-input" name="search" type="search" autocomplete="off" placeholder="搜索站点名称或域名" value="${esc(state.filter)}" aria-label="搜索站点" />
    <span class="keycap" aria-hidden="true">⌘ K</span>
  </label>`;
}

function renderTask() {
  if (!state.task && !state.notice) return "";
  const content = state.notice || state.task;
  const icon = content.kind === "warning" ? "alert" : content.kind === "done" ? "check" : "arrow";
  return `<div class="task-banner" data-kind="${esc(content.kind || "working")}" role="status" aria-live="polite">
    ${svg(icon, true)}<span><strong>${esc(content.title)}</strong><small>${esc(content.detail)}</small></span>
  </div>`;
}

function renderSiteRow(site, index) {
  const [label, kind] = siteState(site);
  const task = state.task?.siteId === site.id ? state.task : null;
  const action = !site.permission ? "grant" : "enter";
  const buttonLabel = !site.permission ? "授权" : task && task.phase !== "submitted" ? "处理中" : "进入";
  const buttonClass = !site.permission ? "action-button secondary" : "action-button";
  return `<div class="site-row">
    <span class="site-number">${String(index + 1).padStart(2, "0")}</span>
    <div class="site-copy">
      <span class="site-name">${esc(site.name)}</span>
      <span class="site-meta"><span class="site-host">${esc(siteHost(site))}</span></span>
    </div>
    <span class="site-method ${kind}" aria-label="凭据方式：${esc(modeLabel(site))}">${esc(modeLabel(site))}</span>
    <button class="${buttonClass}" type="button" data-action="${action}" data-id="${esc(site.id)}" ${task && task.phase !== "submitted" ? "disabled" : ""} aria-label="${esc(buttonLabel + site.name)}">${buttonLabel}</button>
  </div>`;
}

function renderCompact() {
  const sites = filteredSites();
  const shown = state.filter ? sites : sites.slice(0, 5);
  const current = currentSite();
  return `<div class="compact-shell">
    <header class="kl-header">
      ${renderBrand()}
      <button type="button" class="icon-button" data-action="settings" aria-label="打开管理页">${svg("settings")}</button>
    </header>
    <div class="compact-body">
      ${renderSearch()}
      ${current ? `<button class="current-page" type="button" data-action="enter" data-id="${esc(current.id)}" aria-label="在当前页面登录 ${esc(current.name)}">
        ${svg("file", true)}<strong>当前页面</strong><span>${esc(siteHost(current))}</span><span class="matched">已匹配</span>
      </button>` : ""}
      ${renderTask()}
      <div class="section-head"><h2>${state.filter ? "搜索结果" : "常用站点"}</h2><span>${shown.length} 个站点</span></div>
      <div class="site-list">
        ${shown.length ? shown.map(renderSiteRow).join("") : '<div class="empty-state"><strong>没有找到站点</strong>换个名称或域名再试。</div>'}
      </div>
    </div>
    <footer class="compact-footer">
      <button type="button" data-action="all">${svg("list", true)}全部站点${svg("chevron", true)}</button>
      <button type="button" data-action="settings">${svg("settings", true)}管理配置${svg("chevron", true)}</button>
    </footer>
    <div class="compact-footnote">交互演示 · 不会访问真实网站</div>
  </div>`;
}

function renderDashNav() {
  return `<aside class="dash-nav">
    ${renderBrand(true)}
    <button type="button" data-action="view-sites" ${state.view === "sites" ? 'aria-current="page"' : ""}>${svg("list", true)}全部站点</button>
    <button type="button" data-action="view-transfer" ${state.view === "transfer" ? 'aria-current="page"' : ""}>${svg("file", true)}导入与导出</button>
    <div class="nav-spacer"></div>
    <p class="nav-hint">本地配置<br />演示状态不保存</p>
  </aside>`;
}

function renderDashList() {
  const sites = filteredSites();
  return `<section class="dash-main" aria-label="站点列表">
    <div class="dash-titlebar"><div><h2>全部站点</h2><p>选择站点查看或修改登录规则</p></div><button type="button" class="action-button" data-action="new">+ 新增站点</button></div>
    ${renderSearch()}
    ${renderTask()}
    <div class="dash-table" role="listbox" aria-label="已配置站点">
      ${sites.length ? sites.map((site, index) => {
        const [label, kind] = siteState(site);
        return `<button type="button" class="dash-table-row" role="option" aria-selected="${site.id === state.selectedId}" data-action="select" data-id="${esc(site.id)}">
          <span class="site-number">${String(index + 1).padStart(2, "0")}</span>
          <span><strong>${esc(site.name)}</strong><small>${esc(siteHost(site))}</small></span>
          <span>${esc(modeLabel(site))}</span>
          <span class="state-text ${kind}">${esc(label)}</span>
        </button>`;
      }).join("") : '<div class="empty-state"><strong>没有找到站点</strong>换个关键词，或新增一个站点。</div>'}
    </div>
  </section>`;
}

function renderCredentialFields(draft) {
  const credential = draft.credential;
  if (credential.type === "static") return `<label class="field"><span>用户名</span><input data-field="credential.username" value="${esc(credential.username)}" autocomplete="off" /></label>
    <label class="field"><span>密码（演示值）</span><div class="password-line"><input data-field="credential.password" type="${state.showPassword ? "text" : "password"}" value="${esc(credential.password)}" autocomplete="off" /><button type="button" data-action="reveal">${state.showPassword ? "隐藏" : "显示"}</button></div></label>`;
  if (credential.type === "timestampBase64") return `<label class="field"><span>用户名</span><input data-field="credential.username" value="${esc(credential.username)}" /></label>
    <label class="field"><span>时间单位</span><select data-field="credential.unit"><option value="milliseconds" ${credential.unit === "milliseconds" ? "selected" : ""}>毫秒</option><option value="seconds" ${credential.unit === "seconds" ? "selected" : ""}>秒</option></select></label>
    <p class="field-note">提交前生成当前时间戳的十进制字符串，再做 Base64 编码。</p>`;
  return `<label class="field"><span>凭据脚本</span><textarea data-field="credential.code" spellcheck="false">${esc(credential.code)}</textarea></label>
    <p class="field-note">返回 { username, password }。导入的脚本默认停用。</p>`;
}

function renderActionFields(draft) {
  const action = draft.action;
  if (action.type === "pageScript") return `<label class="field"><span>页面登录脚本</span><textarea data-field="action.code" spellcheck="false">${esc(action.code)}</textarea></label>
    <p class="field-note">可以调用页面已有的登录函数；本次账号密码通过 ctx 提供。</p>`;
  return `<label class="field"><span>用户名输入框</span><input data-field="action.usernameSelector" value="${esc(action.usernameSelector)}" placeholder="#username" /></label>
    <label class="field"><span>密码输入框</span><input data-field="action.passwordSelector" value="${esc(action.passwordSelector)}" placeholder="#password" /></label>
    <label class="field"><span>提交按钮</span><input data-field="action.submitSelector" value="${esc(action.submitSelector)}" placeholder="button[type=submit]" /></label>
    <label class="checkbox-row"><input type="checkbox" data-field="action.submit" ${action.submit ? "checked" : ""} /><span>填充后自动提交</span></label>`;
}

function renderInspector() {
  const draft = state.draft || makeDraft(activeSite());
  const isNew = !state.sites.some((site) => site.id === draft.id);
  return `<aside class="dash-inspector" aria-label="站点配置">
    <div class="inspector-heading"><div><h3>${isNew ? "新增站点" : esc(draft.name)}</h3><p>${esc(draft.match.origin || "尚未设置地址")}</p></div>
      <button type="button" class="icon-button" data-action="close-editor" aria-label="关闭配置">${svg("close", true)}</button>
    </div>
    <form id="site-form">
      <div class="inspector-section"><h4>站点</h4>
        <label class="field"><span>名称</span><input data-field="name" value="${esc(draft.name)}" placeholder="例如：文件中心" required /></label>
        <label class="field"><span>登录地址</span><input data-field="loginUrl" value="${esc(draft.loginUrl)}" placeholder="https://example.com/login" required /></label>
        <div class="form-inline"><label class="field"><span>路径约束</span><input data-field="match.pathPrefix" value="${esc(draft.match.pathPrefix || "")}" placeholder="/login" /></label>
        <label class="field"><span>分组</span><input data-field="group" value="${esc(draft.group || "")}" placeholder="常用" /></label></div>
      </div>
      <div class="inspector-section"><h4>凭据来源</h4>
        <label class="field"><span>方式</span><select data-field="credential.type">
          <option value="static" ${draft.credential.type === "static" ? "selected" : ""}>固定密码</option>
          <option value="timestampBase64" ${draft.credential.type === "timestampBase64" ? "selected" : ""}>时间戳 Base64</option>
          <option value="script" ${draft.credential.type === "script" ? "selected" : ""}>自定义 JS</option>
        </select></label>
        ${renderCredentialFields(draft)}
      </div>
      <div class="inspector-section"><h4>登录动作</h4>
        <label class="field"><span>方式</span><select data-field="action.type">
          <option value="form" ${draft.action.type === "form" ? "selected" : ""}>标准表单</option>
          <option value="pageScript" ${draft.action.type === "pageScript" ? "selected" : ""}>调用页面 JS</option>
        </select></label>
        ${renderActionFields(draft)}
        ${usesScript(draft) ? `<label class="checkbox-row"><input type="checkbox" data-field="scriptsEnabled" ${draft.scriptsEnabled ? "checked" : ""} /><span>已检查脚本并允许执行（演示开关）</span></label>` : ""}
      </div>
      ${state.formError ? `<p class="form-error" role="alert">${esc(state.formError)}</p>` : ""}
      <div class="inspector-actions"><button type="submit" class="action-button">保存演示配置</button><button type="button" class="action-button quiet" data-action="enter" data-id="${esc(draft.id)}" ${isNew ? "disabled" : ""}>试用流程</button></div>
      ${!isNew ? `<div class="danger-zone">${state.deleteCandidate === draft.id
        ? `<div class="delete-confirm" role="group" aria-label="确认删除站点"><p>删除“${esc(draft.name)}”？此操作只影响当前演示页面。</p><button type="button" class="action-button quiet" data-action="cancel-delete">取消</button><button type="button" class="action-button danger" data-action="confirm-delete" data-id="${esc(draft.id)}">确认删除</button></div>`
        : `<button type="button" class="delete-trigger" data-action="request-delete" data-id="${esc(draft.id)}">删除站点</button>`}</div>` : ""}
    </form>
  </aside>`;
}

function renderTransfer() {
  return `<section class="dash-main" aria-label="导入与导出">
    <div class="dash-titlebar"><div><h2>导入与导出</h2><p>在另一台电脑继续使用相同的站点配置</p></div></div>
    <div class="migration-box"><h3>导出配置</h3><p>真实产品的导出文件会包含明文密码与脚本。原型只展示内容说明，不生成文件。</p>
      <button class="action-button quiet" type="button" data-action="export-preview">查看导出示意</button>
      ${state.exportPreview ? `<div class="preview-import"><strong>将导出 ${state.sites.length} 个站点</strong><ul><li>格式：版本化 JSON</li><li>包含：站点地址、规则、明文密码与 JS 脚本</li><li>不包含：浏览器授权与临时登录状态</li></ul></div>` : ""}
    </div>
    <div class="migration-box"><h3>导入配置</h3><p>真实产品应先预览站点、冲突与脚本，再确认导入。这里使用虚构数据展示该流程。</p>
      <button class="action-button quiet" type="button" data-action="preview-import">查看导入预览</button>
      ${state.importPreview ? `<div class="preview-import"><strong>待导入：文档中心</strong><ul><li>docs.example · 固定密码</li><li>无同 ID 冲突</li><li>新电脑仍需授予站点权限</li></ul><p>若文件带有 JS，导入后脚本默认停用。</p><button class="action-button" type="button" data-action="commit-import">确认导入演示配置</button></div>` : ""}
    </div>
  </section>`;
}

function renderDashboard() {
  return `<div class="dash-shell">${renderDashNav()}${state.view === "transfer" ? renderTransfer() : renderDashList()}${state.view === "transfer"
    ? '<aside class="dash-inspector"><div class="placeholder-panel"><div>' + svg("file") + '<strong>本地迁移</strong><p>预览、处理冲突，然后手动确认。</p></div></div></aside>'
    : state.draft || activeSite() ? renderInspector() : '<aside class="dash-inspector"><div class="placeholder-panel"><div>' + svg("list") + '<strong>选择一个站点</strong><p>在这里查看和修改它的登录规则。</p></div></div></aside>'}</div>`;
}

function render() {
  app.dataset.surface = state.surface;
  app.innerHTML = state.surface === "dashboard" ? renderDashboard() : renderCompact();
  document.querySelectorAll("[data-surface]").forEach((button) => {
    if (button.closest(".preview-switch")) button.setAttribute("aria-pressed", String(button.dataset.surface === state.surface));
  });
}

function setNotice(title, detail, kind = "done") {
  state.notice = { title, detail, kind };
  state.task = null;
  render();
}

function startLogin(id) {
  const site = state.sites.find((item) => item.id === id);
  if (!site) return setNotice("请先保存站点", "保存演示配置后可试用流程。", "warning");
  if (!site.permission) return setNotice("需要站点授权", `请先为 ${siteHost(site)} 授权；原型仅模拟这一操作。`, "warning");
  if (usesScript(site) && !site.scriptsEnabled) return setNotice("脚本尚未启用", "到管理页检查并开启该站点脚本。", "warning");
  if (site.action.type === "form" && (!site.action.usernameSelector || !site.action.passwordSelector || !site.action.submitSelector)) {
    return setNotice("登录规则不完整", "请补齐表单选择器后重试。", "warning");
  }
  const token = ++state.taskToken;
  state.notice = null;
  state.task = { siteId: id, phase: "opening", title: `正在打开 ${site.name}`, detail: "演示流程：尚未访问任何站点。", kind: "working" };
  render();
  setTimeout(() => {
    if (token !== state.taskToken) return;
    state.task = { siteId: id, phase: "filled", title: "表单已填充（演示）", detail: "下一步将展示提交状态。", kind: "working" };
    render();
  }, 500);
  setTimeout(() => {
    if (token !== state.taskToken) return;
    const submitted = site.action.type === "pageScript" || site.action.submit;
    state.task = {
      siteId: id, phase: "submitted",
      title: submitted ? "已提交（演示）" : "已填充（演示）",
      detail: submitted ? "未验证网站是否登录成功；原型未连接真实站点。" : "配置为仅填充，原型未执行提交。",
      kind: "done",
    };
    render();
  }, 1150);
}

function saveDraft() {
  const draft = state.draft;
  if (!draft) return;
  try {
    const url = new URL(draft.loginUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("地址只支持 http 或 https。");
    if (!draft.name.trim()) throw new Error("请填写站点名称。");
    if (draft.match.pathPrefix && !draft.match.pathPrefix.startsWith("/")) throw new Error("路径约束须以 / 开头。");
    draft.match.origin = url.origin;
  } catch (error) {
    state.formError = error instanceof TypeError ? "请输入有效的登录地址。" : error.message;
    render();
    return;
  }
  const at = state.sites.findIndex((site) => site.id === draft.id);
  if (at >= 0) state.sites[at] = structuredClone(draft);
  else state.sites.push(structuredClone(draft));
  state.selectedId = draft.id;
  state.formError = "";
  setNotice("演示配置已保存", "仅保存在当前页面内存，刷新后恢复虚构样例。");
}

function updateDraft(field, value) {
  if (!state.draft) state.draft = makeDraft(activeSite());
  const draft = state.draft;
  if (field === "credential.type") {
    draft.credential = value === "static" ? { type: value, username: "", password: "" }
      : value === "timestampBase64" ? { type: value, username: "", unit: "milliseconds" }
        : { type: "script", code: "return { username: \"demo\", password: \"demo-only\" };" };
    draft.scriptsEnabled = false; render(); return;
  }
  if (field === "action.type") {
    draft.action = value === "form" ? { type: "form", usernameSelector: "", passwordSelector: "", submitSelector: "", submit: true }
      : { type: "pageScript", code: "window.login(ctx.username, ctx.password); return { submitted: true };" };
    draft.scriptsEnabled = false; render(); return;
  }
  const [first, second] = field.split(".");
  if (second) draft[first][second] = value;
  else draft[first] = value;
}

document.querySelector(".preview-switch").addEventListener("click", (event) => {
  const button = event.target.closest("[data-surface]");
  if (!button) return;
  state.surface = button.dataset.surface;
  state.notice = null;
  state.task = null;
  ++state.taskToken;
  render();
});

app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.name === "search") {
    const start = target.selectionStart, end = target.selectionEnd;
    state.filter = target.value;
    render();
    const replacement = app.querySelector('[name="search"]');
    replacement?.focus();
    replacement?.setSelectionRange(start, end);
  } else if (target.dataset.field && target.type !== "checkbox" && target.tagName !== "SELECT") {
    updateDraft(target.dataset.field, target.value);
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (!target.dataset.field) return;
  updateDraft(target.dataset.field, target.type === "checkbox" ? target.checked : target.value);
});

app.addEventListener("submit", (event) => {
  if (event.target.id !== "site-form") return;
  event.preventDefault();
  saveDraft();
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "enter") return startLogin(id);
  if (action === "grant") {
    const site = state.sites.find((item) => item.id === id);
    if (site) site.permission = true;
    if (state.draft?.id === id) state.draft.permission = true;
    return setNotice("已授权（演示）", `${site?.name || "站点"}现在可试用登录状态。`);
  }
  if (action === "all" || action === "settings" || action === "view-sites") {
    state.surface = "dashboard"; state.view = "sites"; state.notice = null; render(); return;
  }
  if (action === "view-transfer") { state.surface = "dashboard"; state.view = "transfer"; state.notice = null; render(); return; }
  if (action === "select") { state.selectedId = id; state.draft = makeDraft(activeSite()); state.formError = ""; state.deleteCandidate = null; render(); return; }
  if (action === "new") { state.draft = makeDraft(); state.formError = ""; state.showPassword = false; state.deleteCandidate = null; render(); return; }
  if (action === "close-editor") { state.draft = null; state.selectedId = ""; render(); return; }
  if (action === "request-delete") { state.deleteCandidate = id; render(); return; }
  if (action === "cancel-delete") { state.deleteCandidate = null; render(); return; }
  if (action === "confirm-delete") {
    const removed = state.sites.find((site) => site.id === id);
    state.sites = state.sites.filter((site) => site.id !== id);
    state.selectedId = state.sites[0]?.id || "";
    state.draft = state.sites.length ? makeDraft(state.sites[0]) : null;
    state.deleteCandidate = null;
    return setNotice("站点已删除（演示）", `${removed?.name || "该站点"}已从当前页面列表中移除；刷新后恢复样例。`);
  }
  if (action === "reveal") { state.showPassword = !state.showPassword; render(); return; }
  if (action === "preview-import") { state.importPreview = !state.importPreview; render(); return; }
  if (action === "export-preview") { state.exportPreview = !state.exportPreview; render(); return; }
  if (action === "commit-import") {
    if (!state.sites.some((site) => site.id === "docs")) {
      state.sites.push({
        id: "docs", name: "文档中心", loginUrl: "https://docs.example/login",
        match: { origin: "https://docs.example", pathPrefix: "/login" },
        group: "办公", permission: false, scriptsEnabled: false,
        credential: { type: "static", username: "demo-docs", password: "demo-only" },
        action: { type: "form", usernameSelector: "#username", passwordSelector: "#password", submitSelector: "#submit", submit: true },
      });
    }
    state.importPreview = false;
    state.view = "sites";
    state.selectedId = "docs";
    state.draft = makeDraft(activeSite());
    return setNotice("已导入演示配置", "文档中心已加入列表；站点权限仍需单独授权。");
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    app.querySelector('[name="search"]')?.focus();
  }
  if (event.key === "Escape" && state.filter) {
    state.filter = "";
    render();
  }
});

render();
