import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
let timer = null, token = 0;

const css = document.createElement("style");
css.textContent = `
#searchbtn{padding:6px 12px;border-radius:10px;background:var(--raised);color:var(--text);font-weight:600;margin-right:6px}
#sinp{display:block;width:100%;margin:10px 0;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
.sres{max-height:50vh;overflow-y:auto}
.sitem{display:block;width:100%;text-align:left;background:var(--raised);border-left:3px solid var(--accent);border-radius:8px;padding:10px;margin-bottom:8px;color:var(--text);overflow-wrap:anywhere}
.sitem:hover{background:var(--panel)}
.sitem b{margin-right:8px}
.sitem small{color:var(--muted)}
.sitem p{margin:4px 0 0}
.sitem mark{background:var(--accent);color:var(--on-accent);border-radius:3px;padding:0 2px}
.sempty{color:var(--muted);padding:8px 0}
.m.flash .b{outline:2px solid var(--accent);border-radius:12px;transition:outline .3s}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="sov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="st">
  <h2 id="st">Search messages</h2>
  <input id="sinp" maxlength="100" placeholder="Search this channel..." aria-label="Search messages" autocomplete="off">
  <div class="sres" id="sres"></div>
  <div class="row"><button class="cancel" id="sclose">Close</button></div>
</div></div>`);

const btn = document.createElement("button");
btn.id = "searchbtn";
btn.textContent = "Search";
btn.setAttribute("aria-label", "Search messages");
$("membtn").before(btn);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2200);
}

function say(t) {
  const out = $("sres");
  out.textContent = "";
  const d = document.createElement("div");
  d.className = "sempty";
  d.textContent = t;
  out.append(d);
}

// Puts the search word inside <mark> so it lights up
function highlight(el, text, term) {
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let i = 0;
  while (true) {
    const at = lower.indexOf(t, i);
    if (at === -1) break;
    el.append(text.slice(i, at));
    const mk = document.createElement("mark");
    mk.textContent = text.slice(at, at + t.length);
    el.append(mk);
    i = at + t.length;
  }
  el.append(text.slice(i));
}

function jumpTo(id) {
  closeSearch();
  const el = $("msgs").querySelector('[data-id="' + String(id) + '"]');
  if (!el) return toast("That message is older than the 100 most recent ones.");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 2000);
}

async function run() {
  const term = $("sinp").value.trim();
  const my = ++token;
  if (term.length < 2) return say("Type at least 2 letters.");
  const cid = R().cid;
  if (!cid) return say("Open a channel first.");
  say("Searching...");
  // Escape the special characters so they are searched as normal text
  const safe = term.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await supabase
    .from("messages")
    .select("id,user_id,content,created_at")
    .eq("channel_id", cid)
    .ilike("content", "%" + safe + "%")
    .order("created_at", { ascending: false })
    .limit(30);
  if (my !== token) return;
  if (error) return say("Could not search right now.");
  if (!data.length) return say("No messages found.");

  const ids = [...new Set(data.map((m) => m.user_id))];
  const { data: ps } = await supabase.from("profiles").select("id,username").in("id", ids);
  if (my !== token) return;
  const names = {};
  (ps || []).forEach((p) => (names[p.id] = p.username));

  const out = $("sres");
  out.textContent = "";
  data.forEach((m) => {
    const b = document.createElement("button");
    b.className = "sitem";
    const n = document.createElement("b");
    n.textContent = names[m.user_id] || "Unknown";
    const s = document.createElement("small");
    s.textContent = new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const p = document.createElement("p");
    highlight(p, m.content, term);
    b.append(n, s, p);
    b.onclick = () => jumpTo(m.id);
    out.append(b);
  });
}

function openSearch() {
  $("sov").classList.add("on");
  $("sinp").value = "";
  say("Type to search this channel.");
  $("sinp").focus();
}
function closeSearch() { $("sov").classList.remove("on"); }

btn.onclick = openSearch;
$("sclose").onclick = closeSearch;
$("sov").onclick = (e) => { if (e.target === $("sov")) closeSearch(); };
$("sinp").oninput = () => { clearTimeout(timer); timer = setTimeout(run, 300); };
$("sinp").onkeydown = (e) => { if (e.key === "Enter") { clearTimeout(timer); run(); } };
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSearch();
});