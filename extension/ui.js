import {
  DATA_KEY, TASK_KEY, applyImport, checkSelectorsInDocument, emptyData, exportedData,
  hostPermissionPattern, importConflicts, matchesSiteUrl, parseLoginUrl, validateData, validateSite,
} from "./core.js";

const surface = document.body.dataset.surface;
const app = document.querySelector("#app");
const state = {
  data: emptyData(), load: "pending", view: "sites", filter: "", showAll: false,
  selectedId: null, draft: null, showPassword: false, deleteCandidate: null,
  permissions: {}, current: { status: "checking" }, task: null, notice: null,
  busy: "", formError: "", importFile: null, importChoices: {}, importError: "", exportConfirm: false,
};
let loadEpoch = 0;
let permissionEpoch = 0;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const svg = (name, small = false) => `<svg class="icon${small ? " small" : ""}" aria-hidden="true" viewBox="0 0 24 24"><use href="#i-${name}"></use></svg>`;
const siteHost = (site) => { try { return new URL(site.loginUrl).host; } catch { return "无效地址"; } };
const modeLabel = (site) => ({ static: "固定密码", timestampBase64: "时间戳", script: "自定义 JS" })[site.credential.type] || "未配置";
const usesScript = (site) => site.credential.type === "script" || site.action.type === "pageScript";
const activeSite = () => state.data.sites.find((site) => site.id === state.selectedId);
const matchingCurrentSite = () => state.current.status === "ready" ? state.data.sites.find((site) => matchesSiteUrl(site, state.current.url)) : null;
const isTaskActive = () => state.task && !["filled", "submitted", "failed", "unknown"].includes(state.task.phase);
const sortCommon = (sites) => [...sites.filter((site) => site.group === "常用"), ...sites.filter((site) => site.group !== "常用")];

function sprite() {
  return `<svg class="icon-sprite" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 5 5"/></symbol>
    <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></symbol>
    <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></symbol>
    <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"/></symbol>
    <symbol id="i-list" viewBox="0 0 24 24"><path d="M9 5h12M9 12h12M9 19h12"/><circle cx="4" cy="5" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="19" r="1"/></symbol>
    <symbol id="i-file" viewBox="0 0 24 24"><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5M9 12h7M9 16h7"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="m4 12 5 5L20 6"/></symbol>
    <symbol id="i-alert" viewBox="0 0 24 24"><path d="m12 2 10 18H2L12 2Z"/><path d="M12 9v5m0 3v.2"/></symbol>
    <symbol id="i-close" viewBox="0 0 24 24"><path d="M5 5 19 19M19 5 5 19"/></symbol>
    <symbol id="i-key" viewBox="0 0 24 24"><circle cx="7.5" cy="7.5" r="4"/><path d="m10.5 10.5 10 10m-5-5 2-2m.5 5 2-2"/></symbol>
  </svg>`;
}

function brand(short = false) {
  return `<div class="brand"><span class="brand-mark" aria-hidden="true">${svg("key")}</span><span class="brand-word">Keylane</span>${short ? "" : '<span class="brand-sub">内网入口 · 一键直达</span>'}</div>`;
}

function search() {
  return `<label class="search-box">${svg("search")}<span class="sr-only">搜索站点</span>
    <input class="search-input" name="search" type="search" autocomplete="off" placeholder="搜索站点名称或域名" value="${esc(state.filter)}" aria-label="搜索站点" />
    <span class="keycap" aria-hidden="true">⌘ K</span></label>`;
}

function skeletonRows(count = 4) {
  return Array.from({ length: count }, () => '<div class="skeleton-row" aria-hidden="true"><i class="skeleton-bar"></i><i class="skeleton-bar"></i><i class="skeleton-bar"></i></div>').join("");
}

function taskBanner() {
  const task = state.task;
  const active = task && !["filled", "submitted", "failed", "unknown"].includes(task.phase);
  const info = state.notice || (task && {
    kind: task.phase === "failed" || task.phase === "unknown" ? "warning" : active ? "working" : "done",
    title: ({ filled: "已填充", submitted: "已提交", failed: "登录未完成", unknown: "结果未确认" })[task.phase] || "正在执行登录",
    detail: task.message || "请稍候。",
  });
  if (!info) return "";
  return `<div class="task-banner" data-kind="${info.kind}" role="status" aria-live="polite">
    ${svg(info.kind === "warning" ? "alert" : info.kind === "done" ? "check" : "arrow", true)}
    <span><strong>${esc(info.title)}</strong><small>${esc(info.detail)}</small></span></div>`;
}

function filteredSites() {
  const term = state.filter.trim().toLocaleLowerCase();
  return state.data.sites.filter((site) => !term || `${site.name} ${siteHost(site)} ${site.group}`.toLocaleLowerCase().includes(term));
}

function siteState(site) {
  if (!state.permissions[site.id]) return ["需授权", "warning"];
  if (usesScript(site) && !site.scriptsEnabled) return ["脚本未启用", "warning"];
  return ["就绪", "ready"];
}

function siteRow(site, index) {
  const [label, kind] = siteState(site);
  const permission = state.permissions[site.id];
  const disabled = isTaskActive();
  const action = permission ? "enter" : "grant";
  const buttonLabel = disabled ? "处理中" : permission ? "进入" : "授权";
  return `<div class="site-row">
    <span class="site-number">${String(index + 1).padStart(2, "0")}</span>
    <div class="site-copy"><span class="site-name">${esc(site.name)}</span><span class="site-meta"><span class="site-host">${esc(siteHost(site))}</span></span></div>
    <span class="site-method ${kind}" title="${esc(label)}">${esc(modeLabel(site))}</span>
    <button class="action-button ${permission ? "" : "secondary"}" type="button" data-action="${action}" data-id="${esc(site.id)}" ${disabled ? "disabled" : ""} aria-label="${esc(buttonLabel + site.name)}">${buttonLabel}</button>
  </div>`;
}

function currentPage() {
  if (state.current.status === "checking") return '<div class="current-page" role="status">正在检查当前页面…</div>';
  if (state.current.status === "error") return '<div class="current-page" role="status">当前页面不可访问</div>';
  const site = matchingCurrentSite();
  if (!site) return '<div class="current-page" role="status">当前页面未匹配已配置站点</div>';
  const permitted = state.permissions[site.id];
  return `<button class="current-page" type="button" data-action="${permitted ? "enter-current" : "grant"}" data-id="${esc(site.id)}" ${isTaskActive() ? "disabled" : ""}>
    ${svg("file", true)}<strong>当前页面</strong><span>${esc(siteHost(site))}</span><span class="matched">${permitted ? "已匹配" : "需授权"}</span></button>`;
}

function compact() {
  const sites = sortCommon(filteredSites());
  const shown = state.filter || state.showAll ? sites : sites.slice(0, 5);
  return `<div class="compact-shell"><header class="kl-header">${brand()}<button type="button" class="icon-button" data-action="manage" aria-label="打开管理页">${svg("settings")}</button></header>
    <div class="compact-body">${search()}${currentPage()}${taskBanner()}
      <div class="section-head"><h2>${state.filter ? "搜索结果" : state.showAll ? "全部站点" : "常用站点"}</h2><span>${shown.length} 个站点</span></div>
      <div class="site-list">${shown.length ? shown.map(siteRow).join("") : `<div class="empty-state"><strong>${state.filter ? "没有找到站点" : "还没有站点"}</strong>${state.filter ? "换个名称或域名再试。" : '<button class="action-button quiet" data-action="manage" type="button">添加第一个站点</button>'}</div>`}</div>
    </div><footer class="compact-footer"><button type="button" data-action="all">${svg("list", true)}${state.showAll ? "常用站点" : "全部站点"}${svg("chevron", true)}</button><button type="button" data-action="manage">${svg("settings", true)}管理配置${svg("chevron", true)}</button></footer></div>`;
}

function dashboardNav() {
  return `<aside class="dash-nav">${brand(true)}
    <button type="button" data-action="view-sites" ${state.view === "sites" ? 'aria-current="page"' : ""}>${svg("list", true)}全部站点</button>
    <button type="button" data-action="view-transfer" ${state.view === "transfer" ? 'aria-current="page"' : ""}>${svg("file", true)}导入与导出</button>
    <div class="nav-spacer"></div><p class="nav-hint">本地配置<br />不上传到服务端</p></aside>`;
}

function dashboardList() {
  const sites = filteredSites();
  return `<section class="dash-main" aria-label="站点列表">
    <div class="dash-titlebar"><div><h2>全部站点</h2><p>选择站点查看或修改登录规则</p></div><button type="button" class="action-button" data-action="new">+ 新增站点</button></div>
    ${search()}${taskBanner()}
    <div class="dash-table" role="listbox" aria-label="已配置站点">${sites.length ? sites.map((site, index) => {
      const [label, kind] = siteState(site);
      return `<button type="button" class="dash-table-row" role="option" aria-selected="${site.id === state.selectedId}" data-action="select" data-id="${esc(site.id)}">
        <span class="site-number">${String(index + 1).padStart(2, "0")}</span><span><strong>${esc(site.name)}</strong><small>${esc(siteHost(site))}</small></span>
        <span>${esc(modeLabel(site))}</span><span class="state-text ${kind}">${esc(label)}</span></button>`;
    }).join("") : `<div class="empty-state"><strong>${state.filter ? "没有找到站点" : "还没有站点"}</strong>${state.filter ? "换个关键词再试。" : "点击新增站点开始配置。"}</div>`}</div>
  </section>`;
}

function makeDraft(site) {
  return structuredClone(site || {
    id: crypto.randomUUID(), name: "", loginUrl: "", match: { origin: "", pathPrefix: "" }, group: "常用",
    credential: { type: "static", username: "", password: "" },
    action: { type: "form", usernameSelector: "", passwordSelector: "", submitSelector: "", submit: true },
    scriptsEnabled: false,
  });
}

function credentialFields(draft) {
  const item = draft.credential;
  if (item.type === "static") return `<label class="field"><span>用户名</span><input data-field="credential.username" value="${esc(item.username)}" autocomplete="off" required /></label>
    <label class="field"><span>密码</span><div class="password-line"><input data-field="credential.password" type="${state.showPassword ? "text" : "password"}" value="${esc(item.password)}" autocomplete="off" required /><button type="button" data-action="reveal">${state.showPassword ? "隐藏" : "显示"}</button></div></label>`;
  if (item.type === "timestampBase64") return `<label class="field"><span>用户名</span><input data-field="credential.username" value="${esc(item.username)}" required /></label>
    <label class="field"><span>时间单位</span><select data-field="credential.unit"><option value="milliseconds" ${item.unit === "milliseconds" ? "selected" : ""}>毫秒</option><option value="seconds" ${item.unit === "seconds" ? "selected" : ""}>秒</option></select></label>
    <p class="field-note">页面就绪后生成时间戳的十进制字符串，再做 Base64 编码。</p>`;
  return `<label class="field"><span>凭据脚本</span><textarea data-field="credential.code" spellcheck="false" required>${esc(item.code)}</textarea></label><p class="field-note">返回 { username, password }。仅在主动登录时执行。</p>`;
}

function actionFields(draft) {
  const action = draft.action;
  if (action.type === "pageScript") return `<label class="field"><span>页面登录脚本</span><textarea data-field="action.code" spellcheck="false" required>${esc(action.code)}</textarea></label><p class="field-note">可通过 ctx.username 和 ctx.password 调用当前页面的登录函数，返回 { submitted: true }。</p>`;
  return `<label class="field"><span>用户名输入框</span><input data-field="action.usernameSelector" value="${esc(action.usernameSelector)}" placeholder="#username" required /></label>
    <label class="field"><span>密码输入框</span><input data-field="action.passwordSelector" value="${esc(action.passwordSelector)}" placeholder="#password" required /></label>
    <label class="field"><span>提交按钮${action.submit ? "" : "（仅填充时可留空）"}</span><input data-field="action.submitSelector" value="${esc(action.submitSelector)}" placeholder="button[type=submit]" ${action.submit ? "required" : ""} /></label>
    <label class="checkbox-row"><input type="checkbox" data-field="action.submit" ${action.submit ? "checked" : ""} /><span>填充后自动提交</span></label>`;
}

function inspector() {
  const draft = state.draft;
  if (!draft) return `<aside class="dash-inspector"><div class="placeholder-panel"><div>${svg("list")}<strong>选择一个站点</strong><p>在这里查看和修改登录规则。</p></div></div></aside>`;
  const isNew = !state.data.sites.some((site) => site.id === draft.id);
  return `<aside class="dash-inspector" aria-label="站点配置"><div class="inspector-heading"><div><h3>${isNew ? "新增站点" : esc(draft.name)}</h3><p>${esc(draft.match.origin || "尚未设置地址")}</p></div>
    <button type="button" class="icon-button" data-action="close-editor" aria-label="关闭配置">${svg("close", true)}</button></div>
    <form id="site-form"><div class="inspector-section"><h4>站点</h4>
      <label class="field"><span>名称</span><input data-field="name" value="${esc(draft.name)}" placeholder="例如：文件中心" required /></label>
      <label class="field"><span>登录地址</span><input data-field="loginUrl" value="${esc(draft.loginUrl)}" placeholder="https://example.com/login" required /></label>
      <p class="field-note">Chrome 授权按协议和主机；执行时 Keylane 还会核对端口与路径。</p>
      <div class="form-inline"><label class="field"><span>路径约束</span><input data-field="match.pathPrefix" value="${esc(draft.match.pathPrefix || "")}" placeholder="/login" /></label>
      <label class="field"><span>分组</span><input data-field="group" value="${esc(draft.group)}" placeholder="常用" /></label></div></div>
      <div class="inspector-section"><h4>凭据来源</h4><label class="field"><span>方式</span><select data-field="credential.type">
        <option value="static" ${draft.credential.type === "static" ? "selected" : ""}>固定密码</option>
        <option value="timestampBase64" ${draft.credential.type === "timestampBase64" ? "selected" : ""}>时间戳 Base64</option>
        <option value="script" ${draft.credential.type === "script" ? "selected" : ""}>自定义 JS</option></select></label>${credentialFields(draft)}</div>
      <div class="inspector-section"><h4>登录动作</h4><label class="field"><span>方式</span><select data-field="action.type">
        <option value="form" ${draft.action.type === "form" ? "selected" : ""}>标准表单</option>
        <option value="pageScript" ${draft.action.type === "pageScript" ? "selected" : ""}>调用页面 JS</option></select></label>${actionFields(draft)}
        ${usesScript(draft) ? `<label class="checkbox-row"><input type="checkbox" data-field="scriptsEnabled" ${draft.scriptsEnabled ? "checked" : ""} /><span>我已检查此站点的脚本并允许主动执行</span></label>` : ""}</div>
      ${state.formError ? `<p class="form-error" role="alert">${esc(state.formError)}</p>` : ""}
      <div class="inspector-actions"><button type="submit" class="action-button" ${state.busy ? "disabled" : ""}>${state.busy === "saving" ? "保存中" : "保存配置"}</button>
        <button type="button" class="action-button quiet" data-action="enter" data-id="${esc(draft.id)}" ${isNew || state.busy || isTaskActive() ? "disabled" : ""}>试用登录</button></div>
      ${!isNew ? `<div class="danger-zone">${state.deleteCandidate === draft.id
        ? `<div class="delete-confirm" role="group" aria-label="确认删除站点"><p>删除“${esc(draft.name)}”？</p><button type="button" class="action-button quiet" data-action="cancel-delete">取消</button><button type="button" class="action-button danger" data-action="confirm-delete" data-id="${esc(draft.id)}" ${state.busy ? "disabled" : ""}>${state.busy === "deleting" ? "删除中" : "确认删除"}</button></div>`
        : `<button type="button" class="delete-trigger" data-action="request-delete" data-id="${esc(draft.id)}">删除站点</button>`}</div>` : ""}
    </form></aside>`;
}

function transfer() {
  const preview = state.importFile;
  return `<section class="dash-main" aria-label="导入与导出"><div class="dash-titlebar"><div><h2>导入与导出</h2><p>手动迁移到另一台电脑</p></div></div>${taskBanner()}
    <div class="migration-box"><h3>导出配置</h3><p>文件包含明文密码和 JS 脚本，请自行保管。浏览器权限与临时任务不会导出。</p>
      ${state.exportConfirm ? `<div class="preview-import"><strong>确认导出 ${state.data.sites.length} 个站点？</strong><p>生成 UTF-8 JSON 文件，文件名不会包含账号或站点名称。</p><div class="transfer-actions"><button class="action-button" type="button" data-action="export" ${state.busy ? "disabled" : ""}>${state.busy === "exporting" ? "生成中" : "确认导出"}</button><button class="action-button quiet" type="button" data-action="cancel-export">取消</button></div></div>`
      : '<button class="action-button quiet" type="button" data-action="export-preview">导出配置</button>'}</div>
    <div class="migration-box"><h3>导入配置</h3><p>先校验并预览站点、冲突和脚本，再决定导入。导入的脚本统一停用。</p>
      <label class="transfer-file">选择 JSON 文件<input type="file" id="import-file" accept="application/json,.json" ${state.busy ? "disabled" : ""} /></label>
      ${state.importError ? `<p class="form-error" role="alert">${esc(state.importError)}</p>` : ""}
      ${preview ? `<div class="preview-import"><strong>待导入 ${preview.data.sites.length} 个站点</strong><p>请检查下面的域名与脚本。相同 ID 不会静默覆盖。</p>
        ${preview.conflicts.map(({ site, sameId, likelyDuplicate }) => `<div class="conflict-row"><div><strong>${esc(site.name)}</strong><small>${esc(siteHost(site))}${sameId ? " · 同 ID 冲突" : likelyDuplicate ? " · 地址疑似重复" : ""}${usesScript(site) ? " · 含脚本" : ""}</small>
          ${usesScript(site) ? `<details><summary>查看脚本</summary>${site.credential.type === "script" ? `<pre>${esc(site.credential.code)}</pre>` : ""}${site.action.type === "pageScript" ? `<pre>${esc(site.action.code)}</pre>` : ""}</details>` : ""}</div>
          <select data-import-choice="${esc(site.id)}" aria-label="处理 ${esc(site.name)}">${sameId
            ? '<option value="keep">保留现有</option><option value="replace">覆盖现有</option>'
            : likelyDuplicate ? '<option value="skip">跳过</option><option value="import">作为新站点导入</option>'
              : '<option value="import">导入</option><option value="skip">跳过</option>'}</select></div>`).join("")}
        <div class="transfer-actions"><button class="action-button" type="button" data-action="commit-import" ${state.busy ? "disabled" : ""}>${state.busy === "importing" ? "导入中" : "确认导入"}</button><button class="action-button quiet" type="button" data-action="cancel-import">取消</button></div></div>` : ""}</div></section>`;
}

function dashboard() {
  return `<div class="dash-shell">${dashboardNav()}${state.view === "transfer" ? transfer() : dashboardList()}${state.view === "transfer"
    ? `<aside class="dash-inspector"><div class="placeholder-panel"><div>${svg("file")}<strong>本地迁移</strong><p>预览、处理冲突，然后确认。</p></div></div></aside>`
    : inspector()}</div>`;
}

function loadingView() {
  if (surface !== "dashboard") return `<div class="compact-shell" aria-busy="true"><header class="kl-header">${brand()}</header><div class="compact-body"><div class="section-head"><h2>站点</h2></div><div class="site-list">${skeletonRows()}</div></div></div>`;
  return `<div class="dash-shell" aria-busy="true">${dashboardNav()}<section class="dash-main"><h2>全部站点</h2><div class="dash-table">${skeletonRows(5)}</div></section><aside class="skeleton-inspector">${'<i class="skeleton-bar"></i>'.repeat(5)}</aside></div>`;
}

function errorView() {
  return `<div class="status-placeholder" role="alert"><strong>读取配置失败</strong>请重试。这里不会把错误当作空站点。<br/><button class="action-button quiet" type="button" data-action="retry-load">重试</button></div>`;
}

function render() {
  app.dataset.surface = surface;
  if (state.load === "pending") { app.innerHTML = ""; return; }
  app.innerHTML = sprite() + (state.load === "loading" ? loadingView() : state.load === "error" ? errorView() : surface === "dashboard" ? dashboard() : compact());
}

function notice(title, detail, kind = "done") {
  state.notice = { title, detail, kind };
  render();
}

async function refreshPermissions() {
  const epoch = ++permissionEpoch;
  const entries = await Promise.all(state.data.sites.map(async (site) => {
    try { return [site.id, await chrome.permissions.contains({ origins: [hostPermissionPattern(site.match.origin)] })]; }
    catch { return [site.id, false]; }
  }));
  if (epoch !== permissionEpoch) return;
  state.permissions = Object.fromEntries(entries);
  render();
}

async function refreshCurrent() {
  if (surface === "dashboard") return;
  state.current = { status: "checking" }; render();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.current = tab?.id && tab.url ? { status: "ready", tabId: tab.id, url: tab.url } : { status: "error" };
  } catch { state.current = { status: "error" }; }
  render();
}

async function refreshTask() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_TASK" });
    if (response?.ok) { state.task = response.task; render(); }
  } catch { /* Task status is shown after the next storage event. */ }
}

async function loadConfig() {
  const epoch = ++loadEpoch;
  state.load = "pending"; render();
  const skeleton = setTimeout(() => { if (epoch === loadEpoch && state.load === "pending") { state.load = "loading"; render(); } }, 150);
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000));
  try {
    const stored = await Promise.race([chrome.storage.local.get(DATA_KEY), timeout]);
    if (epoch !== loadEpoch) return;
    state.data = stored[DATA_KEY] === undefined ? emptyData() : validateData(stored[DATA_KEY]);
    state.load = "ready";
    if (surface === "dashboard" && !state.draft && state.data.sites.length) {
      state.selectedId = state.data.sites[0].id;
      state.draft = makeDraft(state.data.sites[0]);
    }
    render();
    await Promise.allSettled([refreshPermissions(), refreshCurrent(), refreshTask()]);
  } catch {
    if (epoch === loadEpoch) { state.load = "error"; render(); }
  } finally { clearTimeout(skeleton); }
}

async function writeData(next) {
  await chrome.storage.local.set({ [DATA_KEY]: validateData(next, { checkSelectors: checkSelectorsInDocument }) });
  state.data = next;
  await refreshPermissions();
}

function updateDraft(field, value) {
  if (!state.draft) return;
  const draft = state.draft;
  if (field === "credential.type") {
    draft.credential = value === "static" ? { type: "static", username: "", password: "" }
      : value === "timestampBase64" ? { type: "timestampBase64", username: "", unit: "milliseconds" }
        : { type: "script", code: "" };
    draft.scriptsEnabled = false; render(); return;
  }
  if (field === "action.type") {
    draft.action = value === "form" ? { type: "form", usernameSelector: "", passwordSelector: "", submitSelector: "", submit: true }
      : { type: "pageScript", code: "" };
    draft.scriptsEnabled = false; render(); return;
  }
  const [first, second] = field.split(".");
  if (second) draft[first][second] = value;
  else draft[first] = value;
  if (field === "action.submit" || field === "scriptsEnabled") render();
}

async function saveDraft() {
  if (!state.draft || state.busy) return;
  let draft;
  try {
    const url = parseLoginUrl(state.draft.loginUrl);
    draft = validateSite({ ...state.draft, match: { ...state.draft.match, origin: url.origin } });
    checkSelectorsInDocument(draft);
    const sites = state.data.sites.some((site) => site.id === draft.id)
      ? state.data.sites.map((site) => site.id === draft.id ? draft : site)
      : [...state.data.sites, draft];
    validateData({ schemaVersion: 1, sites }, { checkSelectors: checkSelectorsInDocument });
  } catch (error) { state.formError = error.message || "配置无效。"; render(); return; }
  state.busy = "saving"; state.formError = ""; render();
  try {
    const sites = state.data.sites.some((site) => site.id === draft.id)
      ? state.data.sites.map((site) => site.id === draft.id ? draft : site)
      : [...state.data.sites, draft];
    await writeData({ schemaVersion: 1, sites });
    state.selectedId = draft.id; state.draft = makeDraft(draft);
    notice("配置已保存", "登录前请按站点授予访问权限。");
  } catch { state.formError = "保存失败，草稿仍在当前页面，请重试。"; render(); }
  finally { state.busy = ""; render(); }
}

async function deleteSite(id) {
  if (state.busy) return;
  state.busy = "deleting"; render();
  try {
    const sites = state.data.sites.filter((site) => site.id !== id);
    await writeData({ schemaVersion: 1, sites });
    state.selectedId = sites[0]?.id || null;
    state.draft = sites[0] ? makeDraft(sites[0]) : null;
    state.deleteCandidate = null;
    notice("站点已删除", "本地配置已更新。");
  } catch { state.formError = "删除失败，配置未更新，请重试。"; render(); }
  finally { state.busy = ""; render(); }
}

async function grantPermission(site) {
  try {
    const granted = await chrome.permissions.request({ origins: [hostPermissionPattern(site.match.origin)] });
    await refreshPermissions();
    notice(granted ? "站点已授权" : "未获得授权", granted ? "现在可点击进入。" : "配置仍保留，可稍后再次授权。", granted ? "done" : "warning");
  } catch { notice("授权失败", "请在 Chrome 扩展权限中检查站点访问。", "warning"); }
}

async function startLogin(site, mode) {
  if (isTaskActive()) return;
  if (usesScript(site) && !site.scriptsEnabled) return notice("脚本尚未启用", "请在管理页审阅此站点脚本后启用。", "warning");
  let tabId;
  if (mode === "current") {
    if (!matchingCurrentSite() || !matchesSiteUrl(site, state.current.url)) return notice("当前页不匹配", "请检查站点地址与路径约束。", "warning");
    tabId = state.current.tabId;
  }
  state.notice = null;
  state.task = { siteId: site.id, phase: "permission-check", message: "正在检查站点权限" };
  render();
  if (!state.permissions[site.id]) {
    try {
      const granted = await chrome.permissions.request({ origins: [hostPermissionPattern(site.match.origin)] });
      if (!granted) { state.task = null; return notice("需要站点授权", "未向页面发送凭据。", "warning"); }
      await refreshPermissions();
    } catch { state.task = null; return notice("授权失败", "未向页面发送凭据。", "warning"); }
  }
  try {
    const response = await chrome.runtime.sendMessage({ type: "START_LOGIN", siteId: site.id, mode, tabId });
    if (!response?.ok) { state.task = null; return notice("登录未开始", response?.message || "请稍后重试。", "warning"); }
    state.task = response.task;
    render();
  } catch { state.task = null; notice("结果未确认", "请先检查目标页，再手动重试。", "warning"); }
}

async function chooseImportFile(file) {
  state.importFile = null; state.importError = ""; render();
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { state.importError = "文件超过 8 MiB。"; render(); return; }
  state.busy = "reading"; render();
  try {
    const parsed = JSON.parse(await file.text());
    const data = validateData(parsed, { checkSelectors: checkSelectorsInDocument });
    const conflicts = importConflicts(state.data, data);
    state.importChoices = Object.fromEntries(conflicts.map(({ site, sameId, likelyDuplicate }) => [site.id, sameId ? "keep" : likelyDuplicate ? "skip" : "import"]));
    state.importFile = { data, conflicts };
  } catch { state.importError = "文件无效：请检查 JSON、版本、地址、选择器和脚本大小。原配置未改变。"; }
  finally { state.busy = ""; render(); }
}

async function commitImport() {
  if (!state.importFile || state.busy) return;
  state.busy = "importing"; render();
  try {
    const next = applyImport(state.data, state.importFile.data, state.importChoices);
    await writeData(next);
    state.importFile = null; state.importChoices = {};
    notice("导入完成", "已导入条目的脚本默认停用；权限以当前 Chrome 状态为准。");
  } catch { state.importError = "导入失败，原配置未改变，请重试。"; render(); }
  finally { state.busy = ""; render(); }
}

function exportFile() {
  state.busy = "exporting"; render();
  try {
    const content = JSON.stringify(exportedData(state.data), null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `keylane-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    state.exportConfirm = false;
    notice("已生成导出文件", "文件含明文密码和脚本，请自行保管。");
  } catch { notice("导出失败", "请重试。", "warning"); }
  finally { state.busy = ""; render(); }
}

app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.name === "search") {
    const start = target.selectionStart, end = target.selectionEnd;
    state.filter = target.value; render();
    const replacement = app.querySelector('[name="search"]');
    replacement?.focus(); replacement?.setSelectionRange(start, end);
  } else if (target.dataset.field && target.type !== "checkbox" && target.tagName !== "SELECT") updateDraft(target.dataset.field, target.value);
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (target.id === "import-file") return void chooseImportFile(target.files?.[0]);
  if (target.dataset.importChoice) { state.importChoices[target.dataset.importChoice] = target.value; return; }
  if (target.dataset.field) updateDraft(target.dataset.field, target.type === "checkbox" ? target.checked : target.value);
});

app.addEventListener("submit", (event) => {
  if (event.target.id !== "site-form") return;
  event.preventDefault();
  void saveDraft();
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  const site = state.data.sites.find((item) => item.id === id);
  if (action === "retry-load") return void loadConfig();
  if (action === "manage") return void chrome.runtime.openOptionsPage();
  if (action === "all") { state.showAll = !state.showAll; render(); return; }
  if (action === "grant" && site) return void grantPermission(site);
  if (action === "enter" && site) return void startLogin(site, "new");
  if (action === "enter-current" && site) return void startLogin(site, "current");
  if (action === "view-sites" || action === "view-transfer") { state.view = action === "view-sites" ? "sites" : "transfer"; state.notice = null; render(); return; }
  if (action === "select" && site) { state.selectedId = id; state.draft = makeDraft(site); state.formError = ""; state.deleteCandidate = null; state.showPassword = false; render(); return; }
  if (action === "new") { state.selectedId = null; state.draft = makeDraft(); state.formError = ""; state.deleteCandidate = null; state.showPassword = false; render(); return; }
  if (action === "close-editor") { state.selectedId = null; state.draft = null; render(); return; }
  if (action === "request-delete") { state.deleteCandidate = id; render(); return; }
  if (action === "cancel-delete") { state.deleteCandidate = null; render(); return; }
  if (action === "confirm-delete") return void deleteSite(id);
  if (action === "reveal") { state.showPassword = !state.showPassword; render(); return; }
  if (action === "export-preview") { state.exportConfirm = true; render(); return; }
  if (action === "cancel-export") { state.exportConfirm = false; render(); return; }
  if (action === "export") return exportFile();
  if (action === "cancel-import") { state.importFile = null; state.importChoices = {}; state.importError = ""; render(); return; }
  if (action === "commit-import") return void commitImport();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes[TASK_KEY]) {
    state.task = changes[TASK_KEY].newValue || null;
    state.notice = null;
    render();
  }
  if (area === "local" && changes[DATA_KEY] && state.load === "ready") {
    try { state.data = validateData(changes[DATA_KEY].newValue); void refreshPermissions(); }
    catch { state.load = "error"; render(); }
  }
});
chrome.permissions.onAdded.addListener(() => { void refreshPermissions(); });
chrome.permissions.onRemoved.addListener(() => { void refreshPermissions(); });
chrome.tabs.onActivated.addListener(() => { void refreshCurrent(); });
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => { if (changeInfo.url || changeInfo.status === "complete") void refreshCurrent(); });
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); app.querySelector('[name="search"]')?.focus(); }
  if (event.key === "Escape" && state.filter) { state.filter = ""; render(); }
});

render();
void loadConfig();
