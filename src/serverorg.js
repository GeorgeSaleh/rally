import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
const box = $("chs");
const COLL = "rally-cat-collapsed";

let rank = "none", token = 0, timer = null, drag = null;
const isAdmin = () => R().role === "admin" || rank !== "none";

const css = document.createElement("style");
css.textContent = `
.rs-cat{display:flex;align-items:center;gap:4px;padding:12px 12px 2px;font:700 11px var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);cursor:pointer;user-select:none}
.rs-cat:hover{color:var(--text)}
.rs-cat .rs-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rs-cat button{padding:0 6px;border-radius:6px;color:var(--muted);font-size:12px}
.rs-cat button:hover{background:var(--raised);color:var(--text)}
.rs-zone{height:0}
body.rs-dragging .rs-zone{height:18px}
.rs-zone.rs-over{background:var(--accent);opacity:.5;border-radius:6px}
.rs-hide{display:none!important}
.rs-ghost{opacity:.4}
.rs-over-top{box-shadow:0 -2px 0 var(--accent)}
.rs-over-bottom{box-shadow:0 2px 0 var(--accent)}
.rs-over-in{background:var(--raised)}`;
document.head.append(css);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2800);
}

async function checkRank() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { rank = "none"; return; }
  const { data: r } = await supabase.rpc("my_rank");
  rank = r === "owner" || r === "admin" ? r : "none";
  apply();
}
supabase.auth.onAuthStateChange(() => { setTimeout(checkRank, 0); });

function collapsedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(COLL) || "[]")); } catch (e) { return new Set(); }
}
function saveCollapsed(s) {
  try { localStorage.setItem(COLL, JSON.stringify([...s])); } catch (e) { /* ignore */ }
}

const chanBtns = () => [...box.children].filter((e) => e.tagName === "BUTTON" && !e.dataset.rs && e.textContent.startsWith("# "));

// Hides channels of collapsed categories and updates the arrows
function paintHidden() {
  const coll = collapsedSet();
  let cur = null;
  [...box.children].forEach((el) => {
    if (el.dataset.rs === "cat") {
      cur = el.dataset.id;
      const a = el.querySelector(".rs-arrow");
      if (a) a.textContent = coll.has(cur) ? "▸" : "▾";
    } else if (el.dataset.rcid) {
      el.classList.toggle("rs-hide", !!cur && coll.has(cur) && el.getAttribute("aria-current") !== "true");
    }
  });
}

// ---------- Dragging ----------
const lower = (e, el) => { const r = el.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
function marks() {
  box.querySelectorAll(".rs-over,.rs-over-top,.rs-over-bottom,.rs-over-in").forEach((e) => e.classList.remove("rs-over", "rs-over-top", "rs-over-bottom", "rs-over-in"));
}
function blockOf(h) {
  const out = [h];
  let n = h.nextElementSibling;
  while (n && !n.dataset.rs) { out.push(n); n = n.nextElementSibling; }
  return out;
}
function startDrag(e, kind, el) {
  drag = { kind, el, block: kind === "cat" ? blockOf(el) : [el] };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", "rally");
  document.body.classList.add("rs-dragging");
  setTimeout(() => { if (drag) drag.block.forEach((n) => n.classList.add("rs-ghost")); }, 0);
}
function endDrag() {
  document.body.classList.remove("rs-dragging");
  box.querySelectorAll(".rs-ghost").forEach((n) => n.classList.remove("rs-ghost"));
  marks();
  drag = null;
}
function finish() {
  endDrag();
  paintHidden();
  obs.takeRecords(); // our own moves should not trigger a reload
  clearTimeout(timer);
  save();
}
async function save() {
  const gid = R().gid;
  if (!gid) return;
  const catIds = [], items = [];
  let cur = null, pos = 0;
  [...box.children].forEach((el) => {
    if (el.dataset.rs === "cat") { cur = el.dataset.id; catIds.push(cur); pos = 0; }
    else if (el.dataset.rcid) items.push({ id: el.dataset.rcid, cat: cur, pos: pos++ });
  });
  const { error } = await supabase.rpc("save_channel_layout", { p_group: gid, p_cats: catIds, p_items: items });
  if (error) { toast("Could not save the new order."); apply(); }
}

function wireChan(b) {
  b.draggable = isAdmin();
  if (!isAdmin()) { b.ondragstart = b.ondragend = b.ondragover = b.ondrop = null; return; }
  b.ondragstart = (e) => startDrag(e, "chan", b);
  b.ondragend = endDrag;
  b.ondragover = (e) => {
    if (!drag || drag.kind !== "chan" || drag.el === b) return;
    e.preventDefault();
    marks();
    b.classList.add(lower(e, b) ? "rs-over-bottom" : "rs-over-top");
  };
  b.ondrop = (e) => {
    if (!drag || drag.kind !== "chan" || drag.el === b) return;
    e.preventDefault();
    if (lower(e, b)) b.after(drag.el); else b.before(drag.el);
    finish();
  };
}

function zone(kind) {
  const z = document.createElement("div");
  z.className = "rs-zone";
  z.dataset.rs = kind;
  z.ondragover = (e) => {
    if (!drag || (kind === "top" && drag.kind !== "chan")) return;
    e.preventDefault();
    marks();
    z.classList.add("rs-over");
  };
  z.ondrop = (e) => {
    if (!drag || (kind === "top" && drag.kind !== "chan")) return;
    e.preventDefault();
    if (drag.kind === "chan") { if (kind === "top") z.after(drag.el); else z.before(drag.el); }
    else drag.block.forEach((n) => z.before(n));
    finish();
  };
  return z;
}

// ---------- Category actions ----------
async function newCat() {
  const raw = prompt("Category name (up to 30 characters):");
  if (!raw || !raw.trim()) return;
  const { error } = await supabase.rpc("create_category", { p_group: R().gid, p_name: raw.trim() });
  if (error) return toast(error.message.includes("Too many") ? "A server can have up to 20 categories." : "Could not create it. Did you run the SQL?");
  apply();
}
async function renameCat(id, old) {
  const raw = prompt("New category name:", old);
  if (!raw || !raw.trim() || raw.trim() === old) return;
  const { error } = await supabase.rpc("rename_category", { p_cat: id, p_name: raw.trim() });
  if (error) return toast("Could not rename it.");
  apply();
}
async function delCat(id, name) {
  if (!confirm("Delete the category \"" + name + "\"? Its channels are kept and move to the top.")) return;
  const { error } = await supabase.rpc("delete_category", { p_cat: id });
  if (error) return toast("Could not delete it.");
  apply();
}
function toggle(id) {
  const s = collapsedSet();
  if (s.has(id)) s.delete(id); else s.add(id);
  saveCollapsed(s);
  paintHidden();
}

function header(c) {
  const h = document.createElement("div");
  h.className = "rs-cat";
  h.dataset.rs = "cat";
  h.dataset.id = c.id;
  const arrow = document.createElement("span");
  arrow.className = "rs-arrow";
  const name = document.createElement("span");
  name.className = "rs-name";
  name.textContent = c.name;
  h.append(arrow, name);
  if (isAdmin()) {
    const ed = document.createElement("button");
    ed.textContent = "✎";
    ed.title = "Rename category";
    ed.onclick = (e) => { e.stopPropagation(); renameCat(c.id, c.name); };
    const del = document.createElement("button");
    del.textContent = "✕";
    del.title = "Delete category";
    del.onclick = (e) => { e.stopPropagation(); delCat(c.id, c.name); };
    h.append(ed, del);
    h.draggable = true;
    h.ondragstart = (e) => startDrag(e, "cat", h);
    h.ondragend = endDrag;
  }
  h.onclick = (e) => { if (!e.target.closest("button")) toggle(c.id); };
  h.ondragover = (e) => {
    if (!drag || (drag.kind === "cat" && drag.el === h)) return;
    e.preventDefault();
    marks();
    h.classList.add(drag.kind === "cat" ? "rs-over-top" : "rs-over-in");
  };
  h.ondrop = (e) => {
    if (!drag) return;
    if (drag.kind === "cat") {
      if (drag.el === h) return;
      e.preventDefault();
      drag.block.forEach((n) => h.before(n));
    } else {
      e.preventDefault();
      h.after(drag.el);
    }
    finish();
  };
  return h;
}

// ---------- Build the list ----------
async function apply() {
  const my = ++token;
  const gid = R().gid;
  if (!gid) return;
  const [c1, c2] = await Promise.all([
    supabase.from("channels").select("id,name,category_id,sort_pos").eq("group_id", gid).order("created_at"),
    supabase.from("channel_categories").select("id,name,sort_pos").eq("group_id", gid).order("sort_pos"),
  ]);
  if (my !== token || gid !== R().gid) return;
  if (c1.error || c2.error) return; // SQL not run yet: leave the normal list alone
  const rows = c1.data, cats = c2.data;
  const btns = chanBtns();
  const byId = new Map(rows.map((c) => [String(c.id), c]));
  const mapped = btns.filter((b) => b.dataset.rcid).length;
  if (mapped === 0) {
    if (btns.length !== rows.length || btns.some((b, i) => b.textContent !== "# " + rows[i].name)) return;
    btns.forEach((b, i) => { b.dataset.rcid = String(rows[i].id); });
  } else if (mapped !== btns.length || btns.some((b) => !byId.has(b.dataset.rcid))) {
    return;
  }

  const of = (b) => byId.get(b.dataset.rcid);
  const known = new Set(cats.map((c) => c.id));
  const inCat = (cid) => btns
    .filter((b) => { const k = of(b).category_id; return cid === null ? !k || !known.has(k) : k === cid; })
    .sort((a, b) => of(a).sort_pos - of(b).sort_pos);

  box.querySelectorAll("[data-rs]").forEach((e) => e.remove());
  const keep = new Set(btns);
  const rest = [...box.children].filter((e) => !keep.has(e));
  const list = [zone("top")];
  inCat(null).forEach((b) => list.push(b));
  cats.forEach((c) => {
    list.push(header(c));
    inCat(c.id).forEach((b) => list.push(b));
  });
  list.push(zone("end"));
  if (isAdmin()) {
    const nb = document.createElement("button");
    nb.className = "ch";
    nb.dataset.rs = "new";
    nb.textContent = "+ New category";
    nb.onclick = newCat;
    list.push(nb);
  }
  box.append(...list, ...rest);
  btns.forEach(wireChan);
  paintHidden();
  obs.takeRecords();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(apply, 80);
}
const obs = new MutationObserver(schedule);
obs.observe(box, { childList: true });
checkRank();