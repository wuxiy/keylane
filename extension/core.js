export const DATA_KEY = "keylane.data";
export const TASK_KEY = "keylane.task";
export const SCHEMA_VERSION = 1;
export const MAX_SITES = 200;
export const MAX_SCRIPT_BYTES = 16 * 1024;

export const emptyData = () => ({ schemaVersion: SCHEMA_VERSION, sites: [] });

export class KeylaneError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KeylaneError";
    this.code = code;
  }
}

const fail = (code, message) => { throw new KeylaneError(code, message); };
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const requiredString = (value, label, max = 4096) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail("invalid-config", `${label}不能为空且不得超过 ${max} 字。`);
  return value;
};
const optionalString = (value, label, max = 4096) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max) fail("invalid-config", `${label}格式错误或过长。`);
  return value;
};
const scriptCode = (value, label) => {
  const code = requiredString(value, label, MAX_SCRIPT_BYTES);
  if (new TextEncoder().encode(code).length > MAX_SCRIPT_BYTES) fail("invalid-config", `${label}不得超过 16 KiB。`);
  return code;
};

export function parseLoginUrl(value) {
  const input = requiredString(value, "登录地址", 2048);
  let url;
  try { url = new URL(input); } catch { fail("invalid-url", "请输入完整的 http 或 https 登录地址。"); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) {
    fail("invalid-url", "登录地址只支持无内嵌账号与片段的 http 或 https URL。");
  }
  return url;
}

export function normalizePathPrefix(value) {
  const raw = optionalString(value, "路径约束", 512);
  if (!raw) return "";
  if (!raw.startsWith("/") || raw.includes("?") || raw.includes("#") || raw.includes("\\")) fail("invalid-path", "路径约束须是以 / 开头的路径。");
  let path;
  try { path = new URL(raw, "https://example.test").pathname; } catch { fail("invalid-path", "路径约束无效。"); }
  if (path !== raw) fail("invalid-path", "路径约束不能含需要规范化的片段。");
  return path === "/" ? "/" : path.replace(/\/+$/, "");
}

export function matchesSiteUrl(site, value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return false;
    if (url.origin !== site.match.origin) return false;
    const prefix = site.match.pathPrefix || "";
    return !prefix || prefix === "/" || url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
  } catch { return false; }
}

export function hostPermissionPattern(origin) {
  const url = parseLoginUrl(`${origin}/`);
  // Chrome match patterns cannot constrain ports. matchesSiteUrl checks the full origin later.
  return `${url.protocol}//${url.hostname}/*`;
}

export function validateSite(raw) {
  if (!isObject(raw)) fail("invalid-config", "站点条目格式错误。");
  const id = requiredString(raw.id, "站点 ID", 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail("invalid-config", "站点 ID 只能包含字母、数字、短横线和下划线。");
  const name = requiredString(raw.name, "站点名称", 80).trim();
  const group = optionalString(raw.group, "分组", 40).trim();
  const url = parseLoginUrl(raw.loginUrl);
  if (!isObject(raw.match)) fail("invalid-config", "站点匹配规则缺失。");
  if (raw.match.origin !== url.origin) fail("invalid-config", "匹配 origin 与登录地址不一致。");
  const pathPrefix = normalizePathPrefix(raw.match.pathPrefix);
  if (!matchesSiteUrl({ match: { origin: url.origin, pathPrefix } }, url.href)) fail("invalid-config", "登录地址不在路径约束内。");
  if (!isObject(raw.credential)) fail("invalid-config", "凭据来源缺失。");
  let credential;
  switch (raw.credential.type) {
    case "static": credential = { type: "static", username: requiredString(raw.credential.username, "用户名", 200), password: requiredString(raw.credential.password, "密码", 4096) }; break;
    case "timestampBase64":
      if (!["seconds", "milliseconds"].includes(raw.credential.unit)) fail("invalid-config", "时间单位必须是秒或毫秒。");
      credential = { type: "timestampBase64", username: requiredString(raw.credential.username, "用户名", 200), unit: raw.credential.unit };
      break;
    case "script": credential = { type: "script", code: scriptCode(raw.credential.code, "凭据脚本") }; break;
    default: fail("invalid-config", "不支持的凭据方式。");
  }
  if (!isObject(raw.action)) fail("invalid-config", "登录动作缺失。");
  let action;
  switch (raw.action.type) {
    case "form": {
      if (typeof raw.action.submit !== "boolean") fail("invalid-config", "提交开关格式错误。");
      const submitSelector = optionalString(raw.action.submitSelector, "提交按钮选择器", 500).trim();
      if (raw.action.submit && !submitSelector) fail("invalid-config", "自动提交时必须填写提交按钮选择器。");
      action = {
        type: "form",
        usernameSelector: requiredString(raw.action.usernameSelector, "用户名选择器", 500).trim(),
        passwordSelector: requiredString(raw.action.passwordSelector, "密码选择器", 500).trim(),
        submitSelector,
        submit: raw.action.submit,
      };
      break;
    }
    case "pageScript": action = { type: "pageScript", code: scriptCode(raw.action.code, "页面登录脚本") }; break;
    default: fail("invalid-config", "不支持的登录动作。");
  }
  if (typeof raw.scriptsEnabled !== "boolean") fail("invalid-config", "脚本开关格式错误。");
  return { id, name, group, loginUrl: url.href, match: { origin: url.origin, pathPrefix }, credential, action, scriptsEnabled: raw.scriptsEnabled };
}

export function validateData(raw, { checkSelectors } = {}) {
  if (!isObject(raw) || raw.schemaVersion !== SCHEMA_VERSION || !Array.isArray(raw.sites) || raw.sites.length > MAX_SITES) {
    fail("invalid-data", "配置版本、站点列表或站点数量无效。");
  }
  const sites = raw.sites.map(validateSite);
  const ids = new Set();
  for (const site of sites) {
    if (ids.has(site.id)) fail("invalid-data", "文件中有重复的站点 ID。");
    ids.add(site.id);
    if (checkSelectors) checkSelectors(site);
  }
  return { schemaVersion: SCHEMA_VERSION, sites };
}

export function checkSelectorsInDocument(site, documentRef = document) {
  if (site.action.type !== "form") return;
  for (const selector of [site.action.usernameSelector, site.action.passwordSelector, ...(site.action.submit ? [site.action.submitSelector] : [])]) {
    try { documentRef.querySelector(selector); } catch { fail("invalid-selector", "CSS 选择器无效。"); }
  }
}

export function timestampPassword(unit, now = Date.now()) {
  if (!["seconds", "milliseconds"].includes(unit)) fail("invalid-config", "时间单位无效。");
  const number = unit === "seconds" ? Math.floor(now / 1000) : now;
  const bytes = new TextEncoder().encode(String(number));
  return btoa(String.fromCharCode(...bytes));
}

export function exportedData(data, now = new Date()) {
  return { schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), sites: validateData(data).sites };
}

export function importConflicts(existing, incoming) {
  const current = validateData(existing);
  const proposed = validateData(incoming);
  return proposed.sites.map((site) => ({
    site,
    sameId: current.sites.some((item) => item.id === site.id),
    likelyDuplicate: current.sites.some((item) => item.id !== site.id && item.loginUrl === site.loginUrl && item.match.pathPrefix === site.match.pathPrefix),
  }));
}

export function applyImport(existing, incoming, choices) {
  const list = validateData(existing).sites.slice();
  for (const entry of importConflicts(existing, incoming)) {
    const choice = choices[entry.site.id];
    if (!choice || choice === "skip" || choice === "keep") continue;
    if (entry.sameId && choice !== "replace") fail("invalid-import", "同 ID 条目只能保留或覆盖。");
    if (!entry.sameId && choice !== "import") fail("invalid-import", "新站点只能导入或跳过。");
    const site = { ...entry.site, scriptsEnabled: false };
    const index = list.findIndex((item) => item.id === site.id);
    if (index >= 0) list[index] = site;
    else list.push(site);
  }
  return validateData({ schemaVersion: SCHEMA_VERSION, sites: list });
}
