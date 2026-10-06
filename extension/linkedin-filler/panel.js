import { PLAN } from "./data.js";
import { diagnoseForm, fillOnPage } from "./filler.js";

window.__fillOnPage = fillOnPage; // used by the end to end tests
const LINKEDIN = "https://www.linkedin.com/";
const KEY = "plan:" + PLAN.profileUrl; // progress is kept per plan, so a new plan starts clean

const store = {
  async get() {
    const s = (await chrome.storage.local.get(KEY))[KEY] || {};
    return { done: s.done || {}, skillIndex: s.skillIndex || 0 };
  },
  async set(patch) {
    const cur = await store.get();
    await chrome.storage.local.set({ [KEY]: { ...cur, ...patch } });
  },
};

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}

function show(statusEl, ok, text) {
  statusEl.className = "status show " + (ok ? "ok" : "bad");
  statusEl.textContent = text;
}

async function openStep(step, statusEl) {
  const tab = await activeTab();
  if (tab && tab.url && tab.url.startsWith(LINKEDIN)) await chrome.tabs.update(tab.id, { url: step.open });
  else await chrome.tabs.create({ url: step.open });
  show(statusEl, true, "Opened. " + step.hint);
}

async function inLinkedIn(func, args, statusEl) {
  const tab = await activeTab();
  if (!tab || !tab.url || !tab.url.startsWith(LINKEDIN)) {
    show(statusEl, false, "Switch to your LinkedIn tab first, with the edit form open.");
    return null;
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
    return result;
  } catch (e) {
    show(statusEl, false, "Could not reach the page. Reload the LinkedIn tab and try again. (" + e.message + ")");
    return null;
  }
}

async function runFill(payload, statusEl) {
  const result = await inLinkedIn(fillOnPage, [payload], statusEl);
  if (!result) return null;
  if (result.message) { show(statusEl, false, result.message); return result; }
  const lines = result.results.map((r) => `${r.ok ? "Done" : "Problem"}, ${r.field}, ${r.why}`);
  show(statusEl, result.ok,
    (result.ok ? "Filled. Check it, then press Save on LinkedIn.\n" : "Not everything filled. Fix it by hand, or press Copy and paste.\n") + lines.join("\n"));
  return result;
}

async function copy(text, statusEl, what) {
  await navigator.clipboard.writeText(text);
  show(statusEl, true, `${what} copied. Paste it with Cmd+V or Ctrl+V.`);
}

async function render() {
  const state = await store.get();
  const root = document.getElementById("steps");
  root.textContent = "";
  let group = null;
  for (const step of PLAN.steps) {
    if (step.group !== group) { group = step.group; root.append(el("h2", {}, group)); }
    const statusEl = el("div", { class: "status", role: "status" });
    const done = !!state.done[step.id];
    const tick = el("input", { type: "checkbox", "aria-label": "Mark " + step.title + " done" });
    tick.checked = done;
    tick.addEventListener("change", async () => {
      const s = await store.get();
      s.done[step.id] = tick.checked;
      await store.set({ done: s.done });
      render();
    });
    const buttons = el("div", { class: "row" });
    buttons.append(el("button", { type: "button", onclick: () => openStep(step, statusEl) }, "Open"));
    if (step.fields || step.selects || step.checks) {
      buttons.append(el("button", { type: "button", class: "primary", onclick: () => runFill({ fields: step.fields, guard: step.guard, selects: step.selects, checks: step.checks }, statusEl) }, "Fill"));
    }
    if (step.fields && step.fields.length) {
      buttons.append(el("button", { type: "button", onclick: () => copy(step.fields[step.fields.length - 1].text, statusEl, "Text") }, "Copy"));
    }
    if (step.skillList) {
      const label = (i) => `Fill next skill (${Math.min(i + 1, step.skillList.length)} of ${step.skillList.length})`;
      const btn = el("button", { type: "button", class: "primary" }, label(state.skillIndex));
      btn.addEventListener("click", async () => {
        const s = await store.get();
        if (s.skillIndex >= step.skillList.length) { show(statusEl, true, "All skills done."); return; }
        const r = await runFill({ skill: step.skillList[s.skillIndex] }, statusEl);
        if (r && r.ok) { await store.set({ skillIndex: s.skillIndex + 1 }); btn.textContent = label(s.skillIndex + 1); }
      });
      buttons.append(btn);
      buttons.append(el("button", { type: "button", onclick: () => copy(step.skillList.join(", "), statusEl, "Skill list") }, "Copy list"));
    }
    for (const c of step.copy || []) {
      buttons.append(el("button", { type: "button", onclick: () => copy(c.text, statusEl, c.label) }, "Copy " + c.label.toLowerCase()));
    }
    const preview = step.fields ? step.fields.map((f) => f.text).join("\n\n")
      : step.skillList ? step.skillList.join(", ")
        : (step.copy || []).map((c) => c.label + "\n" + c.text).join("\n\n");
    root.append(el("section", { class: "step" + (done ? " done" : ""), "data-id": step.id },
      el("div", { class: "top" }, el("div", { class: "title" }, step.title), el("label", { class: "tick" }, tick, "done")),
      el("p", { class: "hint" }, step.hint),
      buttons,
      preview ? el("details", {}, el("summary", {}, "See the text"), el("pre", {}, preview)) : null,
      statusEl));
  }
  const n = PLAN.steps.filter((s) => state.done[s.id]).length;
  document.getElementById("progress").textContent = `${n} of ${PLAN.steps.length} steps done`;
  document.getElementById("owner").textContent = PLAN.owner ? `Prepared for ${PLAN.owner}.` : "";
}

document.getElementById("diagnose").addEventListener("click", async () => {
  const statusEl = document.getElementById("progress");
  const report = await inLinkedIn(diagnoseForm, [], { set className(v) {}, set textContent(v) { statusEl.textContent = v; } });
  if (report) {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    statusEl.textContent = "Form layout copied. It holds labels and field types only, none of your text.";
  }
});

render();
