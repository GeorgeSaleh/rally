import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
const SEEN = "rally-seen:";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const css = document.createElement("style");
css.textContent = `
.rm-new{display:flex;align-items:center;gap:10px;margin:10px 0;color:var(--pink);font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;flex:none}
.rm-new::before,.rm-new::after{content:"";flex:1;height:1px;background:var(--pink)}
.rm-link{font-weight:600}`;
document.head.append(css);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2800);
}
function getSeen(cid) { try { return localStorage.getItem(SEEN + cid); } catch (e) { return null; } }
function setSeen(cid, iso) { try { localStorage.setItem(SEEN + cid, iso); } catch (e) { /* ignore */ } }
async function waitFor(fn, ms) {
  const end = Date.now() + (ms || 8000);
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(300);
  }
  return null;
}

// ================= UNREAD "NEW MESSAGES" LINE =================
let runToken = 0, settled = false, decTimer = null;

async function markUnread(cid, token, before) {
  const { data } = await supabase
    .from("messages")
    .select("id,user_id,created_at")
    .eq("channel_id", cid)
    .order("created_at", { ascending: false })
    .limit(100);
  if (token !== runToken || !data || !data.length) return;
  if (before) {
    const t = new Date(before).getTime();
    const unread = data
      .filter((m) => m.user_id !== R().uid && new Date(m.created_at).getTime() > t)
      .reverse();
    for (const m of unread) {
      const el = $("msgs").querySelector('[data-id="' + String(m.id) + '"]');
      if (!el) continue;
      const d = document.createElement("div");
      d.className = "rm-new";
      d.textContent = unread.length === 1 ? "1 new message" : unread.length + " new messages";
      el.before(d);
      d.scrollIntoView({ block: "center" });
      break;
    }
  }
  const newest = data[0].created_at;
  setTimeout(() => { if (token === runToken && !document.hidden) setSeen(cid, newest); }, 4000);
}

function onChannel() {
  const cid = R().cid;
  const token = ++runToken;
  settled = false;
  $("msgs").querySelectorAll(".rm-new").forEach((e) => e.remove());
  if (!cid) return;
  const before = getSeen(cid);
  if (!before) setSeen(cid, new Date().toISOString()); // first visit: no line
  (async () => {
    await sleep(500);
    for (let i = 0; i < 10 && token === runToken && !$("msgs").querySelector(".m[data-id]"); i++) await sleep(400);
    if (token !== runToken) return;
    if ($("msgs").querySelector(".m[data-id]")) await markUnread(cid, token, before);
    if (token === runToken) settled = true;
  })();
}
new MutationObserver(onChannel).observe($("cname"), { childList: true, characterData: true, subtree: true });

// ================= MESSAGE LINKS =================
function decorate(el) {
  const act = el.querySelector(".act");
  if (!act || act.querySelector(".rm-link")) return;
  const b = document.createElement("button");
  b.className = "rm-link";
  b.textContent = "Link";
  b.title = "Copy a link to this message";
  b.onclick = () => {
    const link = location.origin + location.pathname + "#go=" + R().gid + "," + R().cid + "," + el.dataset.id;
    navigator.clipboard.writeText(link).then(() => toast("Message link copied."), () => toast("Could not copy."));
  };
  act.append(b);
}
function decorateAll() {
  $("msgs").querySelectorAll(".m[data-id]").forEach(decorate);
}
new MutationObserver((muts) => {
  clearTimeout(decTimer);
  decTimer = setTimeout(decorateAll, 120);
  if (!settled || document.hidden || !document.hasFocus() || !R().cid) return;
  const added = muts.some((mu) => [...mu.addedNodes].some((n) => n.nodeType === 1 && n.classList.contains("m")));
  if (added) setSeen(R().cid, new Date().toISOString());
}).observe($("msgs"), { childList: true, subtree: true });

// ================= OPENING A LINK =================
let jumpToken = 0;
async function startJump() {
  const m = location.hash.match(/^#go=([\w-]+),([\w-]+),([\w-]+)$/);
  if (!m) return;
  const gid = m[1], cid = m[2], mid = m[3];
  const token = ++jumpToken;
  const done = (msg) => {
    if (msg) toast(msg);
    if (token === jumpToken) history.replaceState(null, "", location.pathname + location.search);
  };
  if (!(await waitFor(() => R().uid, 90000))) return done("Log in, then open the link again.");
  if (token !== jumpToken) return;
  await waitFor(() => R().cid, 15000);
  const { data: mem } = await supabase
    .from("group_members").select("group_id").eq("group_id", gid).eq("user_id", R().uid).maybeSingle();
  if (!mem) return done("You are not in that server.");
  if (R().gid !== gid) {
    if (!R().reload) return done("Could not open that server.");
    await R().reload(gid);
  }
  if (R().cid !== cid) {
    const { data: ch } = await supabase.from("channels").select("name").eq("id", cid).maybeSingle();
    if (!ch) return done("That channel no longer exists.");
    const btn = await waitFor(() => [...$("chs").querySelectorAll(".ch")].find((b) => b.textContent === "# " + ch.name));
    if (!btn) return done("Could not open that channel.");
    btn.click();
  }
  const el = await waitFor(() => $("msgs").querySelector('[data-id="' + mid + '"]'), 10000);
  if (!el) return done("That message is too old to show, or it was deleted.");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 2500);
  done();
}
window.addEventListener("hashchange", startJump);
startJump();