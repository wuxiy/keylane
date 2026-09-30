import test from "node:test";
import assert from "node:assert/strict";
import {
  applyImport, emptyData, exportedData, hostPermissionPattern, importConflicts,
  matchesSiteUrl, timestampPassword, validateData, validateSite,
} from "../extension/core.js";

const fixedSite = (overrides = {}) => ({
  id: "files", name: "文件中心", group: "常用", loginUrl: "http://127.0.0.1:4173/login",
  match: { origin: "http://127.0.0.1:4173", pathPrefix: "/login" },
  credential: { type: "static", username: "fictional-user", password: "fictional-password" },
  action: { type: "form", usernameSelector: "#username", passwordSelector: "#password", submitSelector: "button[type=submit]", submit: true },
  scriptsEnabled: false, ...overrides,
});

test("完整 origin 与路径段一起限制注入，URL 片段不影响匹配", () => {
  const site = validateSite(fixedSite());
  assert.equal(matchesSiteUrl(site, "http://127.0.0.1:4173/login#ready"), true);
  assert.equal(matchesSiteUrl(site, "http://127.0.0.1:4173/login/second"), true);
  for (const url of [
    "https://127.0.0.1:4173/login", "http://127.0.0.1:4174/login",
    "http://localhost:4173/login", "http://127.0.0.1:4173/login-helper",
  ]) assert.equal(matchesSiteUrl(site, url), false, url);
  assert.equal(hostPermissionPattern(site.match.origin), "http://127.0.0.1/*");
});

test("仅填充允许空提交选择器；地址或匹配规则不一致不能保存", () => {
  const fillOnly = fixedSite({ action: { type: "form", usernameSelector: "#username", passwordSelector: "#password", submitSelector: "", submit: false } });
  assert.equal(validateSite(fillOnly).action.submitSelector, "");
  assert.throws(() => validateSite(fixedSite({ match: { origin: "http://127.0.0.1:4174", pathPrefix: "/login" } })));
  assert.throws(() => validateSite(fixedSite({ match: { origin: "http://127.0.0.1:4173", pathPrefix: "/login-helper" } })));
  assert.throws(() => validateSite(fixedSite({ loginUrl: "javascript:alert(1)" })));
});

test("时间戳按秒或毫秒取十进制字符串后 Base64", () => {
  assert.equal(timestampPassword("milliseconds", 1_700_000_000_123), btoa("1700000000123"));
  assert.equal(timestampPassword("seconds", 1_700_000_000_123), btoa("1700000000"));
});

test("导入先区分同 ID 与疑似重复，实际导入脚本一律停用", () => {
  const current = { schemaVersion: 1, sites: [fixedSite()] };
  const sameId = fixedSite({ name: "新的名称", scriptsEnabled: true });
  const similar = fixedSite({ id: "files-copy", scriptsEnabled: true });
  const incoming = { schemaVersion: 1, sites: [sameId, similar] };
  const conflicts = importConflicts(current, incoming);
  assert.deepEqual(conflicts.map(({ sameId, likelyDuplicate }) => [sameId, likelyDuplicate]), [[true, false], [false, true]]);
  const unchanged = applyImport(current, incoming, { files: "keep", "files-copy": "skip" });
  assert.deepEqual(unchanged, validateData(current));
  const imported = applyImport(current, incoming, { files: "replace", "files-copy": "import" });
  assert.equal(imported.sites.length, 2);
  assert.equal(imported.sites[0].name, "新的名称");
  assert.equal(imported.sites[0].scriptsEnabled, false);
  assert.equal(imported.sites[1].scriptsEnabled, false);
});

test("导出只包含版本、时间与站点；坏文件在写入前拒绝", () => {
  const value = exportedData({ schemaVersion: 1, sites: [fixedSite()] }, new Date("2026-01-02T03:04:05Z"));
  assert.deepEqual(Object.keys(value), ["schemaVersion", "exportedAt", "sites"]);
  assert.equal(value.sites[0].credential.password, "fictional-password");
  assert.throws(() => validateData({ schemaVersion: 2, sites: [] }));
  assert.throws(() => applyImport(emptyData(), { schemaVersion: 1, sites: [fixedSite({ action: { type: "pageScript", code: "x".repeat(20_000) } })] }, { files: "import" }));
});
