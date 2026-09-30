import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const extension = join(root, "extension");
const chromeBin = process.env.KEYLANE_CHROME_BIN || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : chromium.executablePath());
if (!existsSync(chromeBin)) throw new Error("找不到 Chrome；请设置 KEYLANE_CHROME_BIN。建议 Chrome 138+。");

const temp = await mkdtemp(join(tmpdir(), "keylane-browser-"));
const fixture = await readFile(join(root, "tests/fixtures/login.html"));
const servers = [];
const contexts = [];
const checks = [];
const record = (name) => { checks.push(name); process.stdout.write(`✓ ${name}\n`); };

async function serve(handler) {
  const server = createServer(handler);
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  servers.push(server);
  return server.address().port;
}

async function openProfile(name, extensionPath) {
  const context = await chromium.launchPersistentContext(join(temp, name), {
    headless: true,
    executablePath: chromeBin,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
    acceptDownloads: true,
  });
  contexts.push(context);
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: extensionPath });
  const options = await context.newPage();
  const pageErrors = [];
  options.on("pageerror", (error) => pageErrors.push(error.message));
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.getByRole("button", { name: /新增站点/ }).waitFor();
  return { context, id, options, pageErrors };
}

function site(id, name, loginUrl, pathPrefix, credential, action, scriptsEnabled = false) {
  return {
    id, name, group: "常用", loginUrl,
    match: { origin: new URL(loginUrl).origin, pathPrefix },
    credential, action, scriptsEnabled,
  };
}

async function setSites(options, sites) {
  await options.evaluate(async (value) => chrome.storage.local.set({ "keylane.data": { schemaVersion: 1, sites: value } }), sites);
}

async function runSite(popup, name, expectedStatus) {
  await popup.getByRole("button", { name: `进入${name}` }).click();
  await popup.getByText(expectedStatus, { exact: true }).waitFor({ timeout: 20_000 });
}

try {
  let otherPort = 0;
  const firstPort = await serve((req, response) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/redirect") {
      response.writeHead(302, { Location: `http://127.0.0.1:${otherPort}/login` });
      response.end();
    } else if (url.pathname === "/login") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(fixture);
    } else { response.writeHead(404); response.end(); }
  });
  otherPort = await serve((_req, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fixture);
  });

  // This copy grants only the fictional localhost host. The product manifest remains optional-only.
  const grantedExtension = join(temp, "host-granted-extension");
  await cp(extension, grantedExtension, { recursive: true });
  const manifestPath = join(grantedExtension, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.host_permissions = ["http://127.0.0.1/*"];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const a = await openProfile("profile-a", grantedExtension);
  const { options, context, id } = a;
  const consoleErrors = [];
  options.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await options.getByRole("button", { name: /新增站点/ }).click();
  await options.locator('[data-field="name"]').fill("本地固定密码测试");
  await options.locator('[data-field="loginUrl"]').fill(`http://127.0.0.1:${firstPort}/login?case=fixed`);
  await options.locator('[data-field="match.pathPrefix"]').fill("/login");
  await options.locator('[data-field="credential.username"]').fill("fictional-user");
  await options.locator('[data-field="credential.password"]').fill("fictional-password");
  await options.locator('[data-field="action.usernameSelector"]').fill("#username");
  await options.locator('[data-field="action.passwordSelector"]').fill("#password");
  await options.locator('[data-field="action.submitSelector"]').fill("#submit");
  await options.getByRole("button", { name: "保存配置" }).click();
  await options.getByText("配置已保存").waitFor();
  const saved = await options.evaluate(async () => (await chrome.storage.local.get("keylane.data"))["keylane.data"]);
  assert.equal(saved.sites.length, 1);
  record("管理页保存版本化配置");

  const popup = await context.newPage();
  popup.on("pageerror", (error) => a.pageErrors.push(error.message));
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await runSite(popup, "本地固定密码测试", "已提交");
  const fixedPage = context.pages().find((page) => page.url().includes("case=fixed"));
  const fixed = await fixedPage.evaluate(() => ({
    username: document.querySelector("#username").value,
    password: document.querySelector("#password").value,
    events: window.keylaneTest,
  }));
  assert.equal(fixed.username, "fictional-user");
  assert.equal(fixed.password, "fictional-password");
  assert.equal(fixed.events.inputEvents, 2);
  assert.equal(fixed.events.changeEvents, 2);
  assert.equal(fixed.events.submitCount, 1);
  await popup.screenshot({ path: join(tmpdir(), "keylane-browser-popup.png") });
  record("固定密码填充、事件和单次提交");

  const form = { type: "form", usernameSelector: "#username", passwordSelector: "#password", submitSelector: "#submit", submit: true };
  const staticCredential = { type: "static", username: "fictional-user", password: "fictional-password" };
  const dynamic = site("dynamic", "时间戳测试", `http://127.0.0.1:${firstPort}/login?case=dynamic`, "/login", { type: "timestampBase64", username: "clock-user", unit: "seconds" }, form);
  const script = site("script", "脚本测试", `http://127.0.0.1:${firstPort}/login?case=script`, "/login",
    { type: "script", code: 'return { username: "script-user", password: btoa("script-value") };' },
    { type: "pageScript", code: "window.login(ctx.username, ctx.password); return { submitted: true };" }, true);
  const redirect = site("redirect", "跳转测试", `http://127.0.0.1:${firstPort}/redirect`, "/redirect", staticCredential, form);
  const rerender = site("rerender", "重绘表单测试", `http://127.0.0.1:${firstPort}/login?rerender`, "/login", staticCredential, form);
  const multiple = site("multiple", "多重选择器测试", `http://127.0.0.1:${firstPort}/login?multiple`, "/login", staticCredential, { ...form, usernameSelector: "input" });
  const fillOnly = site("fill-only", "仅填充测试", `http://127.0.0.1:${firstPort}/login?fill-only`, "/login", staticCredential,
    { ...form, submit: false, submitSelector: "" });
  const delayed = site("delayed", "延迟表单测试", `http://127.0.0.1:${firstPort}/login?delay`, "/login", staticCredential, form);
  const missing = site("missing", "缺失表单测试", `http://127.0.0.1:${firstPort}/login?missing`, "/login", staticCredential, form);
  await setSites(options, [...saved.sites, dynamic, script, redirect, rerender, multiple, fillOnly, delayed, missing]);
  await popup.getByRole("button", { name: "进入时间戳测试" }).waitFor();
  const before = Date.now();
  await runSite(popup, "时间戳测试", "已提交");
  const after = Date.now();
  const dynamicPage = context.pages().find((page) => page.url().includes("case=dynamic"));
  const dynamicResult = await dynamicPage.evaluate(() => ({ password: document.querySelector("#password").value, count: window.keylaneTest.submitCount }));
  const timestamp = Number(atob(dynamicResult.password));
  assert.ok(timestamp >= Math.floor(before / 1000) && timestamp <= Math.floor(after / 1000));
  assert.equal(dynamicResult.count, 1);
  record("页面就绪后的秒级时间戳密码");

  await runSite(popup, "跳转测试", "登录未完成");
  assert.match(await popup.locator(".task-banner").innerText(), /地址.*不匹配/);
  const redirectedPage = context.pages().find((page) => page.url().startsWith(`http://127.0.0.1:${otherPort}/`));
  await redirectedPage.waitForLoadState("domcontentloaded");
  const redirected = await redirectedPage.evaluate(() => ({ password: document.querySelector("#password").value, count: window.keylaneTest.submitCount }));
  assert.equal(redirected.password, "");
  assert.equal(redirected.count, 0);
  record("跨端口跳转不发送凭据");

  await runSite(popup, "重绘表单测试", "已提交");
  const rerenderPage = context.pages().find((page) => page.url().includes("?rerender"));
  const rerenderResult = await rerenderPage.evaluate(() => ({ password: document.querySelector("#password").value, count: window.keylaneTest.submitCount }));
  assert.equal(rerenderResult.password, "fictional-password");
  assert.equal(rerenderResult.count, 1);
  record("页面重绘后的密码框重新定位");

  await popup.getByRole("button", { name: "全部站点" }).click();
  await runSite(popup, "多重选择器测试", "登录未完成");
  assert.match(await popup.locator(".task-banner").innerText(), /匹配多个元素/);
  const multiplePage = context.pages().find((page) => page.url().includes("?multiple"));
  assert.equal(await multiplePage.evaluate(() => window.keylaneTest.submitCount), 0);
  record("多重选择器停止提交");

  const fillPage = await context.newPage();
  await fillPage.goto(fillOnly.loginUrl);
  const fillTabId = await options.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === url)?.id;
  }, fillOnly.loginUrl);
  assert.ok(Number.isInteger(fillTabId));
  const fillTask = await options.evaluate(async ({ siteId, tabId }) =>
    chrome.runtime.sendMessage({ type: "START_LOGIN", siteId, mode: "current", tabId }),
  { siteId: fillOnly.id, tabId: fillTabId });
  assert.equal(fillTask.task.phase, "filled");
  const filled = await fillPage.evaluate(() => ({
    user: document.querySelector("#username").value,
    password: document.querySelector("#password").value,
    submits: window.keylaneTest.submitCount,
  }));
  assert.equal(filled.user, "fictional-user");
  assert.equal(filled.password, "fictional-password");
  assert.equal(filled.submits, 0);
  const wrongTabId = await options.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === url)?.id;
  }, redirectedPage.url());
  const mismatch = await options.evaluate(async ({ siteId, tabId }) =>
    chrome.runtime.sendMessage({ type: "START_LOGIN", siteId, mode: "current", tabId }),
  { siteId: fillOnly.id, tabId: wrongTabId });
  assert.equal(mismatch.task.phase, "failed");
  assert.match(mismatch.task.message, /地址.*不匹配/);
  record("当前页匹配时仅填充，不匹配时拒绝执行");

  const delayedPage = await context.newPage();
  await delayedPage.goto(delayed.loginUrl);
  const delayedTabId = await options.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === url)?.id;
  }, delayed.loginUrl);
  const doubleClick = await options.evaluate(async ({ siteId, tabId }) => Promise.all([
    chrome.runtime.sendMessage({ type: "START_LOGIN", siteId, mode: "current", tabId }),
    chrome.runtime.sendMessage({ type: "START_LOGIN", siteId, mode: "current", tabId }),
  ]), { siteId: delayed.id, tabId: delayedTabId });
  assert.equal(doubleClick.filter((item) => item.ok && item.task.phase === "submitted").length, 1);
  assert.equal(doubleClick.filter((item) => !item.ok && /已有登录任务/.test(item.message)).length, 1);
  assert.equal(await delayedPage.evaluate(() => window.keylaneTest.submitCount), 1);
  record("2s 延迟表单与并发命令只提交一次");

  const missingTask = await options.evaluate(async (siteId) =>
    chrome.runtime.sendMessage({ type: "START_LOGIN", siteId, mode: "new" }), missing.id);
  assert.equal(missingTask.task.phase, "failed");
  assert.match(missingTask.task.message, /等待表单元素超时/);
  const missingPage = context.pages().find((page) => page.url().includes("?missing"));
  assert.equal(await missingPage.evaluate(() => window.keylaneTest.submitCount), 0);
  record("表单超过 15s 未出现后停止且不提交");

  await runSite(popup, "脚本测试", "登录未完成");
  assert.match(await popup.locator(".task-banner").innerText(), /Allow User Scripts/);
  const detail = await context.newPage();
  await detail.goto(`chrome://extensions/?id=${id}`);
  await detail.locator("#allow-user-scripts").click();
  await popup.reload();
  await runSite(popup, "脚本测试", "已提交");
  const scriptPage = context.pages().filter((page) => page.url().includes("case=script")).at(-1);
  const scriptResult = await scriptPage.evaluate(() => window.keylaneTest);
  assert.equal(scriptResult.pageCalls, 1);
  assert.equal(scriptResult.lastPageLogin.username, "script-user");
  assert.equal(scriptResult.lastPageLogin.password, btoa("script-value"));
  record("用户脚本开关关闭与开启后的执行结果");

  const slow = await context.newPage();
  await slow.addInitScript(() => {
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = async (...args) => { await new Promise((resolveDelay) => setTimeout(resolveDelay, 800)); return original(...args); };
  });
  await slow.goto(`chrome-extension://${id}/sidepanel.html`);
  await slow.setViewportSize({ width: 390, height: 760 });
  await slow.waitForTimeout(250);
  assert.ok(await slow.locator(".skeleton-row").count() > 0);
  assert.equal(await slow.locator('[aria-busy="true"]').count(), 1);
  await slow.getByRole("button", { name: "进入本地固定密码测试" }).waitFor({ timeout: 3000 });
  assert.equal(await slow.locator(".skeleton-row").count(), 0);
  assert.ok(await slow.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await slow.screenshot({ path: join(tmpdir(), "keylane-browser-sidepanel.png") });
  record("Side Panel 骨架切换及窄宽度无横向溢出");

  const failRead = await context.newPage();
  await failRead.addInitScript(() => { chrome.storage.local.get = () => Promise.reject(new Error("fictional read failure")); });
  await failRead.goto(`chrome-extension://${id}/popup.html`);
  await failRead.getByText("读取配置失败").waitFor();
  assert.equal(await failRead.getByRole("button", { name: "重试" }).count(), 1);
  record("配置读取失败显示重试而非空列表");

  const timedOutRead = await context.newPage();
  await timedOutRead.addInitScript(() => { chrome.storage.local.get = () => new Promise(() => {}); });
  await timedOutRead.goto(`chrome-extension://${id}/popup.html`);
  await timedOutRead.getByText("读取配置失败").waitFor({ timeout: 7000 });
  assert.equal(await timedOutRead.locator(".skeleton-row").count(), 0);
  assert.equal(await timedOutRead.getByRole("button", { name: "重试" }).count(), 1);
  record("配置读取超过 5s 后结束骨架并显示重试");

  await setSites(options, [script]);
  await options.getByRole("button", { name: "导入与导出" }).click();
  await options.getByRole("button", { name: "导出配置" }).click();
  const downloadPromise = options.waitForEvent("download");
  await options.getByRole("button", { name: "确认导出" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const exported = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(Object.keys(exported), ["schemaVersion", "exportedAt", "sites"]);
  assert.equal(exported.sites[0].scriptsEnabled, true);
  assert.ok(!download.suggestedFilename().includes("script"));
  record("明文 JSON 导出仅含版本、时间与站点");

  const b = await openProfile("profile-b", extension);
  await b.options.getByRole("button", { name: "导入与导出" }).click();
  await b.options.locator("#import-file").setInputFiles(path);
  await b.options.getByText("待导入 1 个站点").waitFor();
  assert.match(await b.options.locator(".preview-import").last().innerText(), /含脚本/);
  await b.options.getByRole("button", { name: "确认导入" }).click();
  await b.options.getByText("导入完成").waitFor();
  const imported = await b.options.evaluate(async () => (await chrome.storage.local.get("keylane.data"))["keylane.data"]);
  const permissions = await b.options.evaluate(async () => chrome.permissions.getAll());
  assert.equal(imported.sites[0].scriptsEnabled, false);
  assert.deepEqual(permissions.origins, []);
  const denied = await b.options.evaluate(async (siteId) => chrome.runtime.sendMessage({ type: "START_LOGIN", siteId, mode: "new" }), script.id);
  assert.equal(denied.task.phase, "failed");
  assert.match(denied.task.message, /需要授权/);
  record("第二配置导入后脚本停用且权限不迁移");

  await b.options.locator("#import-file").setInputFiles({
    name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"schemaVersion":2,"sites":[]}'),
  });
  await b.options.getByText(/文件无效：请检查/).waitFor();
  const afterInvalid = await b.options.evaluate(async () => (await chrome.storage.local.get("keylane.data"))["keylane.data"]);
  assert.deepEqual(afterInvalid, imported);
  const conflictFile = { schemaVersion: 1, sites: [
    { ...script, name: "脚本测试更新" },
    { ...script, id: "script-copy", name: "地址重复测试" },
  ] };
  await b.options.locator("#import-file").setInputFiles({
    name: "conflict.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(conflictFile)),
  });
  await b.options.getByText("待导入 2 个站点").waitFor();
  assert.match(await b.options.locator(".preview-import").last().innerText(), /同 ID 冲突/);
  assert.match(await b.options.locator(".preview-import").last().innerText(), /地址疑似重复/);
  await b.options.getByRole("combobox", { name: "处理 脚本测试更新" }).selectOption("replace");
  await b.options.getByRole("combobox", { name: "处理 地址重复测试" }).selectOption("import");
  await b.options.getByRole("button", { name: "确认导入" }).click();
  await b.options.getByText("导入完成").waitFor();
  const resolved = await b.options.evaluate(async () => (await chrome.storage.local.get("keylane.data"))["keylane.data"]);
  assert.deepEqual(resolved.sites.map((item) => item.name), ["脚本测试更新", "地址重复测试"]);
  assert.ok(resolved.sites.every((item) => !item.scriptsEnabled));
  record("坏文件不写入；同 ID 与疑似重复按用户选择导入");

  await options.getByRole("button", { name: "全部站点" }).click();
  await options.getByRole("button", { name: /新增站点/ }).click();
  await options.locator('[data-field="name"]').fill("临时配置测试");
  await options.locator('[data-field="loginUrl"]').fill(`http://127.0.0.1:${firstPort}/login`);
  await options.locator('[data-field="match.pathPrefix"]').fill("/login");
  await options.locator('[data-field="credential.username"]').fill("fictional-user");
  await options.locator('[data-field="credential.password"]').fill("fictional-password");
  await options.locator('[data-field="action.usernameSelector"]').fill("#username");
  await options.locator('[data-field="action.passwordSelector"]').fill("#password");
  await options.locator('[data-field="action.submitSelector"]').fill("#submit");
  await options.getByRole("button", { name: "保存配置" }).click();
  await options.getByText("配置已保存").waitFor();
  await options.reload();
  await options.getByRole("option", { name: /临时配置测试/ }).click();
  assert.equal(await options.locator('[data-field="credential.password"]').getAttribute("type"), "password");
  await options.locator('[data-field="name"]').fill("临时配置已编辑");
  await options.getByRole("button", { name: "保存配置" }).click();
  await options.getByText("配置已保存").waitFor();
  await options.reload();
  await options.getByRole("option", { name: /临时配置已编辑/ }).click();
  await options.getByRole("button", { name: "删除站点" }).click();
  await options.getByRole("button", { name: "取消" }).click();
  assert.equal(await options.getByRole("option", { name: /临时配置已编辑/ }).count(), 1);
  await options.getByRole("button", { name: "删除站点" }).click();
  await options.getByRole("button", { name: "确认删除" }).click();
  await options.getByText("站点已删除").waitFor();
  await options.reload();
  assert.equal(await options.getByRole("option", { name: /临时配置已编辑/ }).count(), 0);
  record("站点新增、编辑、删除与密码遮挡在重开后保持正确");

  const failWrite = await context.newPage();
  await failWrite.addInitScript(() => { chrome.storage.local.set = () => Promise.reject(new Error("fictional write failure")); });
  await failWrite.goto(`chrome-extension://${id}/options.html`);
  await failWrite.getByRole("option", { name: /脚本测试/ }).click();
  await failWrite.locator('[data-field="name"]').fill("尚未写入的名称");
  await failWrite.getByRole("button", { name: "保存配置" }).click();
  await failWrite.getByText(/保存失败，草稿仍在当前页面/).waitFor();
  assert.equal(await failWrite.locator('[data-field="name"]').inputValue(), "尚未写入的名称");
  const afterWriteFailure = await options.evaluate(async () => (await chrome.storage.local.get("keylane.data"))["keylane.data"]);
  assert.equal(afterWriteFailure.sites[0].name, "脚本测试");
  record("配置写入失败保留草稿且不假报成功");

  assert.deepEqual(a.pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(b.pageErrors, []);
  record("扩展页面无运行错误");
  process.stdout.write(`Chrome 浏览器检查通过：${checks.length} 项。\n`);
} finally {
  await Promise.allSettled(contexts.map((context) => context.close()));
  await Promise.allSettled(servers.map((server) => new Promise((resolveClose) => server.close(resolveClose))));
  await rm(temp, { recursive: true, force: true });
}
