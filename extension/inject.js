// These functions are serialized by chrome.scripting.executeScript. Keep them self-contained.
export async function probePage(config) {
  const match = () => {
    const url = new URL(location.href);
    const prefix = config.pathPrefix;
    return url.origin === config.origin && (!prefix || prefix === "/" || url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  };
  if (!match()) return { ok: false, code: "url-mismatch" };
  const selectors = config.action.type === "form"
    ? [config.action.usernameSelector, config.action.passwordSelector, ...(config.action.submit ? [config.action.submitSelector] : [])]
    : [];
  const inspect = () => {
    if (!match()) return { ok: false, code: "url-mismatch" };
    for (const selector of selectors) {
      let found;
      try { found = document.querySelectorAll(selector); } catch { return { ok: false, code: "invalid-selector" }; }
      if (found.length > 1) return { ok: false, code: "multiple-elements" };
      if (found.length === 0) return null;
    }
    if (config.action.type === "form") {
      const user = document.querySelector(config.action.usernameSelector);
      const pass = document.querySelector(config.action.passwordSelector);
      const submit = config.action.submit ? document.querySelector(config.action.submitSelector) : null;
      if (user === pass || (submit && (submit === user || submit === pass)) || !["INPUT", "TEXTAREA"].includes(user.tagName) || !["INPUT", "TEXTAREA"].includes(pass.tagName)) {
        return { ok: false, code: "wrong-element" };
      }
    }
    return { ok: true };
  };
  const initial = inspect();
  if (initial) return initial;
  return await new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };
    const observer = new MutationObserver(() => { const result = inspect(); if (result) finish(result); });
    observer.observe(document, { childList: true, subtree: true });
    const timer = setTimeout(() => finish({ ok: false, code: "elements-timeout" }), config.timeoutMs);
    const afterObserve = inspect();
    if (afterObserve) finish(afterObserve);
  });
}

export function fillForm(config, credential) {
  const matches = () => {
    const url = new URL(location.href);
    const prefix = config.pathPrefix;
    return url.origin === config.origin && (!prefix || prefix === "/" || url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  };
  if (!matches()) return { ok: false, code: "url-mismatch" };
  const getOne = (selector) => {
    let nodes;
    try { nodes = document.querySelectorAll(selector); } catch { return { error: "invalid-selector" }; }
    return nodes.length === 1 ? { element: nodes[0] } : { error: nodes.length ? "multiple-elements" : "missing-element" };
  };
  const username = getOne(config.usernameSelector);
  const password = getOne(config.passwordSelector);
  const submit = config.submit ? getOne(config.submitSelector) : null;
  const error = username.error || password.error || submit?.error;
  if (error) return { ok: false, code: error };
  if (username.element === password.element || (submit && (submit.element === username.element || submit.element === password.element)) || !["INPUT", "TEXTAREA"].includes(username.element.tagName) || !["INPUT", "TEXTAREA"].includes(password.element.tagName)) {
    return { ok: false, code: "wrong-element" };
  }
  const setValue = (element, value) => {
    const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("native-setter-unavailable");
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  try {
    setValue(username.element, credential.username);
    if (!matches()) return { ok: false, code: "url-mismatch" };
    const freshPassword = getOne(config.passwordSelector);
    if (freshPassword.error) return { ok: false, code: freshPassword.error };
    if (!["INPUT", "TEXTAREA"].includes(freshPassword.element.tagName)) return { ok: false, code: "wrong-element" };
    setValue(freshPassword.element, credential.password);
    if (config.submit) {
      if (!matches()) return { ok: false, code: "url-mismatch" };
      const freshSubmit = getOne(config.submitSelector);
      if (freshSubmit.error) return { ok: false, code: freshSubmit.error };
      if (freshSubmit.element === freshPassword.element || freshSubmit.element === username.element || typeof freshSubmit.element.click !== "function") return { ok: false, code: "wrong-element" };
      freshSubmit.element.click();
    }
  } catch { return { ok: false, code: "execution-failed" }; }
  return { ok: true, submitted: config.submit };
}
