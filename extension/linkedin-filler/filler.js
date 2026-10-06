// Runs inside the LinkedIn tab. Chrome serialises each function into the page, so both must stay
// self contained, with no imports and no outer variables.
//
// fillOnPage only types into fields, selects dates and ticks boxes in the form that is open. It
// never presses Save, never deletes anything, and refuses to touch a form that belongs to a
// different job, project or school than the step expects. It is async because ticking a box can
// make LinkedIn render new fields, such as the end date lists, a moment later.
//
// diagnoseForm reports the shape of the open form (headings, labels, field types) and never any
// field values, so the report is safe to paste into a bug report.

export async function fillOnPage(payload) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Polls until fn returns something, for fields that appear after a click re-renders the form.
  async function waitFor(fn, ms = 2000) {
    const end = Date.now() + ms;
    let found = fn();
    while (!found && Date.now() < end) {
      await sleep(100);
      found = fn();
    }
    return found;
  }
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const CONTROL =
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, select, [contenteditable="true"], [role="textbox"]';

  // The most recently opened visible dialog is the form being edited.
  const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open], .artdeco-modal')].filter(visible);
  const root = dialogs.length ? dialogs[dialogs.length - 1] : document;

  const labelText = (el) => norm(el.textContent).replace(/\*/g, "").trim();
  const matches = (text, wanted) => wanted.some((w) => text === w || text.startsWith(w + " "));

  function controlFor(lab, selector) {
    if (lab.htmlFor) {
      const c = document.getElementById(lab.htmlFor);
      if (c) return c;
    }
    const inner = lab.querySelector(selector);
    if (inner) return inner;
    if (lab.id) {
      const c = root.querySelector('[aria-labelledby~="' + CSS.escape(lab.id) + '"]');
      if (c) return c;
    }
    let box = lab.parentElement;
    for (let i = 0; i < 3 && box; i += 1, box = box.parentElement) {
      const cs = [...box.querySelectorAll(selector)].filter(visible);
      if (cs.length === 1) return cs[0];
    }
    return null;
  }

  function find(labels, selector = CONTROL) {
    const wanted = labels.map(norm);
    for (const lab of root.querySelectorAll("label")) {
      if (matches(labelText(lab), wanted)) {
        const c = controlFor(lab, selector);
        if (c && visible(c)) return c;
      }
    }
    for (const el of root.querySelectorAll(selector)) {
      if (!visible(el)) continue;
      const own = norm(el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").replace(/\*/g, "").trim();
      if (own && matches(own, wanted)) return el;
      const ids = el.getAttribute("aria-labelledby");
      if (ids) {
        const t = norm(ids.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || "").join(" "))
          .replace(/\*/g, "").trim();
        if (t && matches(t, wanted)) return el;
      }
    }
    return null;
  }

  const isRich = (el) => el.isContentEditable || (el.getAttribute("role") === "textbox" && !("value" in el));
  const valueOf = (el) => (isRich(el) ? el.innerText : el.value);

  function setText(el, text) {
    el.focus();
    if (isRich(el)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (typeof el.select === "function") {
      el.select();
    }
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch { ok = false; }
    if (!ok || norm(valueOf(el)) !== norm(text)) {
      if (isRich(el)) {
        el.innerText = text;
      } else {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return norm(valueOf(el)) === norm(text);
  }

  // A scope such as "End date" narrows the search to the group that heading or label belongs to,
  // so an end date can never land in the start date lists.
  function scopeFor(name) {
    if (!name) return root;
    const want = norm(name);
    const marks = [...root.querySelectorAll("legend, label, span, p, h3, h4, div")]
      .filter((el) => el.children.length === 0 || el.tagName === "LEGEND")
      .filter((el) => labelText(el) === want || labelText(el).startsWith(want + " "));
    for (const mark of marks) {
      let box = mark.parentElement;
      for (let i = 0; i < 4 && box; i += 1, box = box.parentElement) {
        if ([...box.querySelectorAll("select")].some(visible)) return box;
      }
    }
    return null;
  }

  // Wrong form guard. Nothing is changed unless every condition holds for the open form.
  const guards = Array.isArray(payload.guard) ? payload.guard : payload.guard ? [payload.guard] : [];
  for (const g of guards) {
    const el = find(g.labels);
    const shown = el ? (valueOf(el) || "").trim() : null;
    const v = shown === null ? null : norm(shown);
    if ("emptyOr" in g) {
      if (v === null) return { ok: false, results: [], message: "Open a new, empty form first. Nothing was changed." };
      if (v !== "" && v !== norm(g.emptyOr)) {
        return { ok: false, results: [], message: `This form already holds "${shown}". Press + to open a new, empty form. Nothing was changed.` };
      }
      continue;
    }
    const want = g.equals || g.contains || "";
    const ok = v !== null && (g.equals ? v === norm(want) : v.includes(norm(want)));
    if (!ok) {
      return {
        ok: false,
        results: [],
        message: el
          ? `This form is for "${shown}", not "${want}". Nothing was changed.`
          : `Open the edit form for ${want} first. Nothing was changed.`,
      };
    }
  }

  const results = [];

  let clicked = false;
  for (const c of payload.checks || []) {
    const box = find(c.labels, 'input[type="checkbox"]');
    if (!box) {
      results.push({ field: c.labels[0], ok: false, why: "tick box not found" });
      continue;
    }
    if (box.checked !== c.checked) {
      box.click();
      clicked = true;
    }
    results.push({ field: c.labels[0], ok: box.checked === c.checked, why: c.checked ? "ticked" : "unticked" });
  }
  if (clicked) await sleep(50); // let the page re-render before looking for the fields a tick reveals

  for (const f of payload.fields || []) {
    let el = find(f.labels);
    if (!el && f.fallbackFirstTextarea) {
      el = [...root.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')].find(visible) || null;
    }
    if (!el) {
      results.push({ field: f.labels[0], ok: false, why: "field not found" });
      continue;
    }
    let text = f.text;
    if (f.append) {
      const cur = valueOf(el) || "";
      if (norm(cur).includes(norm(f.text))) {
        results.push({ field: f.labels[0], ok: true, why: "already there" });
        continue;
      }
      if (cur.trim()) text = cur.replace(/\s+$/, "") + "\n\n" + f.text;
    }
    const max = el.maxLength;
    if (typeof max === "number" && max > 0 && text.length > max) {
      results.push({ field: f.labels[0], ok: false, why: `too long for this field, ${text.length} of ${max} characters` });
      continue;
    }
    const ok = setText(el, text);
    results.push({ field: f.labels[0], ok, why: ok ? "filled" : "the text did not stick" });
  }

  const used = new Set();
  for (const s of payload.selects || []) {
    const label = (s.scope ? s.scope + ", " : "") + s.option;
    const pick = () => {
      const where = scopeFor(s.scope);
      if (!where) return null;
      return [...where.querySelectorAll("select")]
        .filter((x) => visible(x) && !x.disabled && !used.has(x))
        .find((x) => [...x.options].some((o) => norm(o.textContent) === norm(s.option))) || null;
    };
    const sel = await waitFor(pick);
    if (!sel) {
      results.push({ field: label, ok: false, why: scopeFor(s.scope) ? "date list not found" : "date group not found" });
      continue;
    }
    used.add(sel);
    const opt = [...sel.options].find((o) => norm(o.textContent) === norm(s.option));
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, opt.value);
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    results.push({ field: label, ok: sel.value === opt.value, why: "selected" });
  }

  if (payload.skill) {
    const el = find(["Skill", "Skills"]);
    if (!el) results.push({ field: "Skill", ok: false, why: "field not found" });
    else {
      const ok = setText(el, payload.skill);
      results.push({ field: "Skill", ok, why: ok ? "typed, now pick the suggestion" : "the text did not stick" });
    }
  }

  return { ok: results.length > 0 && results.every((r) => r.ok), results, inForm: root !== document };
}

export function diagnoseForm() {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open], .artdeco-modal')].filter(visible);
  const root = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  const heading = norm((root.querySelector("h1, h2, h3") || {}).textContent || "").slice(0, 80);
  const labels = [...root.querySelectorAll("label, legend")].filter(visible).map((l) => norm(l.textContent).slice(0, 60)).filter(Boolean);
  const controls = [...root.querySelectorAll("input, textarea, select, [contenteditable=true], [role=textbox]")]
    .filter(visible)
    .map((c) => {
      const type = c.tagName.toLowerCase() + (c.type ? "/" + c.type : "") + (c.isContentEditable ? "/rich" : "");
      const name = norm(c.getAttribute("aria-label") || c.getAttribute("placeholder") || "").slice(0, 60);
      return name ? `${type} (${name})` : type;
    });
  return {
    page: location.pathname.replace(/\/in\/[^/]+/, "/in/[you]"),
    inForm: dialogs.length > 0,
    heading,
    labels: [...new Set(labels)].slice(0, 40),
    controls: controls.slice(0, 40),
    saveButton: [...root.querySelectorAll("button")].some((b) => /^save$/i.test(norm(b.textContent))),
  };
}
