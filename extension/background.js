import { DATA_KEY, TASK_KEY, KeylaneError, emptyData, hostPermissionPattern, matchesSiteUrl, timestampPassword, validateData } from "./core.js";
import { probePage, fillForm } from "./inject.js";

const WORKER_ID = crypto.randomUUID();
const TASK_LIFETIME_MS = 35_000;
const PAGE_WAIT_MS = 15_000;
let running = false;
let accessReady;

function ensureAccessLevel() {
  accessReady ||= chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  return accessReady;
}

chrome.runtime.onInstalled.addListener(() => { void ensureAccessLevel(); });
void ensureAccessLevel();

async function readData() {
  await ensureAccessLevel();
  const value = (await chrome.storage.local.get(DATA_KEY))[DATA_KEY];
  return value === undefined ? emptyData() : validateData(value);
}

async function getTask() {
  const task = (await chrome.storage.session.get(TASK_KEY))[TASK_KEY] || null;
  if (!task) return null;
  if (!task.endedAt && (task.workerId !== WORKER_ID || Date.now() > task.expiresAt)) {
    const interrupted = { ...task, phase: "unknown", message: "结果未确认，请先检查目标页，再手动重试。", endedAt: Date.now() };
    await chrome.storage.session.set({ [TASK_KEY]: interrupted });
    return interrupted;
  }
  return task;
}

async function updateTask(task, phase, extra = {}) {
  const next = { ...task, phase, ...extra };
  await chrome.storage.session.set({ [TASK_KEY]: next });
  return next;
}

function publicTask(task) {
  if (!task) return null;
  const { id, siteId, tabId, phase, message, startedAt, endedAt } = task;
  return { id, siteId, tabId, phase, message, startedAt, endedAt };
}

function messageFor(code) {
  return ({
    "site-missing": "站点已不存在。",
    "permission-required": "需要授权此站点后才能登录。",
    "url-mismatch": "当前页面地址与站点规则不匹配。",
    "unsupported-page": "此页面不支持注入登录脚本。",
    "tab-closed": "目标页面已关闭。",
    "page-timeout": "等待目标页面超时。",
    "elements-timeout": "等待表单元素超时。",
    "invalid-selector": "CSS 选择器无效。",
    "multiple-elements": "选择器匹配多个元素，请缩小范围。",
    "missing-element": "目标元素已消失，请重试。",
    "wrong-element": "选择器没有指向可填写的输入框。",
    "script-disabled": "请先在管理页审阅并启用此站点脚本。",
    "user-scripts-unavailable": "请在 Chrome 扩展详情中开启 Allow User Scripts。",
    "script-result-invalid": "脚本返回值格式不正确。",
    "script-failed": "脚本执行失败，请检查站点规则。",
    "execution-failed": "页面操作失败，请检查站点规则。",
    "busy": "已有登录任务正在进行，请稍后。",
  })[code] || "登录任务失败，请检查站点配置与页面。";
}

async function targetTab(site, mode, currentTabId, deadline) {
  let tab;
  if (mode === "current") {
    if (!Number.isInteger(currentTabId)) throw new KeylaneError("unsupported-page", "");
    try { tab = await chrome.tabs.get(currentTabId); } catch { throw new KeylaneError("tab-closed", ""); }
    if (!matchesSiteUrl(site, tab.url || "")) throw new KeylaneError("url-mismatch", "");
  } else {
    tab = await chrome.tabs.create({ url: site.loginUrl, active: true });
  }
  while (Date.now() < deadline) {
    try { tab = await chrome.tabs.get(tab.id); } catch { throw new KeylaneError("tab-closed", ""); }
    const url = tab.url || tab.pendingUrl || "";
    if (/^https?:/i.test(url)) {
      let parsed;
      try { parsed = new URL(url); } catch { throw new KeylaneError("url-mismatch", ""); }
      if (parsed.origin !== site.match.origin) throw new KeylaneError("url-mismatch", "");
      if (tab.status === "complete") {
        if (!matchesSiteUrl(site, url)) throw new KeylaneError("url-mismatch", "");
        return tab;
      }
    } else if (url && url !== "about:blank") {
      throw new KeylaneError("unsupported-page", "");
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new KeylaneError("page-timeout", "");
}

async function verifyTarget(site, tabId, documentId) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { throw new KeylaneError("tab-closed", ""); }
  if (!matchesSiteUrl(site, tab.url || "")) throw new KeylaneError("url-mismatch", "");
  const result = await chrome.scripting.executeScript({
    target: { tabId, documentIds: [documentId] },
    func: () => location.href,
  });
  if (result.length !== 1 || result[0].documentId !== documentId || !matchesSiteUrl(site, result[0].result)) throw new KeylaneError("url-mismatch", "");
}

function injectedResult(results, documentId) {
  const item = results?.find((entry) => entry.documentId === documentId && entry.frameId === 0);
  if (!item || item.error) throw new KeylaneError("execution-failed", "");
  return item.result;
}

function scriptSource(code, site, context) {
  const expected = JSON.stringify({ origin: site.match.origin, pathPrefix: site.match.pathPrefix });
  const ctx = JSON.stringify(context || {});
  return `(() => {
    const expected = ${expected};
    const url = new URL(location.href);
    if (url.origin !== expected.origin || (expected.pathPrefix && expected.pathPrefix !== "/" && url.pathname !== expected.pathPrefix && !url.pathname.startsWith(expected.pathPrefix + "/"))) return { __keylaneError: "url-mismatch" };
    const ctx = ${ctx};
    return (function () { ${code}\n }).call(window);
  })()`;
}

async function runUserScript(code, site, context, tabId, documentId, world) {
  if (!chrome.userScripts) throw new KeylaneError("user-scripts-unavailable", "");
  try { await chrome.userScripts.getScripts(); } catch { throw new KeylaneError("user-scripts-unavailable", ""); }
  let results;
  try {
    results = await chrome.userScripts.execute({
      js: [{ code: scriptSource(code, site, context) }],
      target: { tabId, documentIds: [documentId] },
      world,
    });
  } catch { throw new KeylaneError("script-failed", ""); }
  const item = results?.find((entry) => entry.documentId === documentId && entry.frameId === 0);
  if (!item || item.error) throw new KeylaneError("script-failed", "");
  if (item.result?.__keylaneError) throw new KeylaneError(item.result.__keylaneError, "");
  return item.result;
}

async function runLogin(siteId, mode, currentTabId) {
  if (running) throw new KeylaneError("busy", "");
  running = true;
  let previous;
  try { previous = await getTask(); }
  catch (error) { running = false; throw error; }
  if (previous && !previous.endedAt) {
    running = false;
    throw new KeylaneError("busy", "");
  }
  const task = {
    id: crypto.randomUUID(), siteId, tabId: null, phase: "permission-check", message: "正在检查站点权限",
    workerId: WORKER_ID, startedAt: Date.now(), expiresAt: Date.now() + TASK_LIFETIME_MS,
  };
  let current = task;
  try {
    await chrome.storage.session.set({ [TASK_KEY]: task });
    const data = await readData();
    const site = data.sites.find((item) => item.id === siteId);
    if (!site) throw new KeylaneError("site-missing", "");
    const granted = await chrome.permissions.contains({ origins: [hostPermissionPattern(site.match.origin)] });
    if (!granted) throw new KeylaneError("permission-required", "");
    if ((site.credential.type === "script" || site.action.type === "pageScript") && !site.scriptsEnabled) throw new KeylaneError("script-disabled", "");
    current = await updateTask(current, "opening", { message: mode === "current" ? "正在检查当前页面" : "正在打开登录页面" });
    const tab = await targetTab(site, mode, currentTabId, Date.now() + PAGE_WAIT_MS);
    current = await updateTask(current, "url-check", { tabId: tab.id, message: "正在核对地址和目标元素" });
    const probe = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: probePage,
      args: [{ origin: site.match.origin, pathPrefix: site.match.pathPrefix, action: site.action, timeoutMs: PAGE_WAIT_MS }],
    });
    const documentId = probe?.[0]?.documentId;
    if (!documentId || probe[0].frameId !== 0) throw new KeylaneError("execution-failed", "");
    if (!probe[0].result?.ok) throw new KeylaneError(probe[0].result?.code || "execution-failed", "");
    await verifyTarget(site, tab.id, documentId);
    current = await updateTask(current, "credential-ready", { message: "页面已就绪，正在生成本次凭据" });
    let credential;
    if (site.credential.type === "static") credential = { username: site.credential.username, password: site.credential.password };
    else if (site.credential.type === "timestampBase64") credential = { username: site.credential.username, password: timestampPassword(site.credential.unit) };
    else {
      credential = await runUserScript(site.credential.code, site, {}, tab.id, documentId, "USER_SCRIPT");
      if (!credential || typeof credential.username !== "string" || typeof credential.password !== "string" || !credential.username || !credential.password) {
        throw new KeylaneError("script-result-invalid", "");
      }
      credential = { username: credential.username, password: credential.password };
    }
    await verifyTarget(site, tab.id, documentId);
    current = await updateTask(current, "executing", { message: "正在执行页面登录动作" });
    let result;
    if (site.action.type === "form") {
      const output = await chrome.scripting.executeScript({
        target: { tabId: tab.id, documentIds: [documentId] }, func: fillForm,
        args: [{ ...site.action, origin: site.match.origin, pathPrefix: site.match.pathPrefix }, credential],
      });
      result = injectedResult(output, documentId);
    } else {
      result = await runUserScript(site.action.code, site, credential, tab.id, documentId, "MAIN");
      if (!result || result.submitted !== true) throw new KeylaneError("script-result-invalid", "");
      result = { ok: true, submitted: true };
    }
    if (!result?.ok) throw new KeylaneError(result?.code || "execution-failed", "");
    current = await updateTask(current, result.submitted ? "submitted" : "filled", {
      message: result.submitted ? "已提交；请以目标页面确认登录结果。" : "已填充；尚未提交。",
      endedAt: Date.now(),
    });
  } catch (error) {
    const code = error instanceof KeylaneError ? error.code : "execution-failed";
    const unknown = current.phase === "executing" && ["script-failed", "script-result-invalid", "execution-failed"].includes(code);
    current = await updateTask(current, unknown ? "unknown" : "failed", {
      message: unknown ? "结果未确认，请先检查目标页，再手动重试。" : messageFor(code),
      endedAt: Date.now(),
    });
  } finally {
    running = false;
  }
  return publicTask(current);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "GET_TASK") {
    getTask().then((task) => sendResponse({ ok: true, task: publicTask(task) }), () => sendResponse({ ok: false, message: "读取任务状态失败。" }));
    return true;
  }
  if (message.type === "START_LOGIN") {
    runLogin(message.siteId, message.mode, message.tabId).then(
      (task) => sendResponse({ ok: true, task }),
      (error) => sendResponse({ ok: false, message: messageFor(error.code) }),
    );
    return true;
  }
});
