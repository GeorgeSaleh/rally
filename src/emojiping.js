import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
const PING = /(^|[^A-Za-z0-9_])@everyone(?![A-Za-z0-9_])/i;

let rank = "none";
const isAdmin = () => R().role === "admin" || rank !== "none";

const css = document.createElement("style");
css.textContent = `
.m.rp-ping .b{box-shadow:0 0 0 2px var(--accent)}
.rp-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:var(--accent);color:#10121d;font:800 11px var(--body);display:grid;place-items:center;border:3px solid var(--rail);box-sizing:border-box;pointer-events:none;z-index:2}`;
document.head.append(css);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 3200);
}

async function checkRank() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { rank = "none"; return; }
  const { data: r } = await supabase.rpc("my_rank");
  rank = r === "owner" || r === "admin" ? r : "none";
}
supabase.auth.onAuthStateChange(() => { setTimeout(checkRank, 0); });
checkRank();

// Messages that ping everyone get an amber outline
function markPings() {
  $("msgs").querySelectorAll(".m").forEach((m) => {
    const mt = m.querySelector(".mt");
    if (mt) m.classList.toggle("rp-ping", PING.test(mt.dataset.raw || ""));
  });
}
let pingTimer = null;
new MutationObserver(() => {
  clearTimeout(pingTimer);
  pingTimer = setTimeout(markPings, 80);
}).observe($("msgs"), { childList: true, subtree: true });

// Only admins can send @everyone
function pingGate(e) {
  if (e.type === "keydown" && (e.key !== "Enter" || e.isComposing)) return;
  if (!PING.test($("inp").value)) return;
  if (!isAdmin()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return toast("Only admins can use @everyone.");
  }
  if (!confirm("Notify EVERYONE in this server?")) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}
$("inp").addEventListener("keydown", pingGate, true);
$("send").addEventListener("click", pingGate, true);

let live = null, blockedIds = new Set(), blockTimer = null;
const chanGroup = new Map(), seenMsgs = new Set(), unseen = {};

async function loadBlocked() {
  const { data } = await supabase.from("blocks").select("blocked_id");
  blockedIds = new Set((data || []).map((x) => x.blocked_id));
}
async function groupOf(cid) {
  if (!chanGroup.has(cid)) {
    const { data } = await supabase.from("channels").select("group_id").eq("id", cid).maybeSingle();
    chanGroup.set(cid, data ? data.group_id : null);
  }
  return chanGroup.get(cid);
}
function paintBadges() {
  document.querySelectorAll("#rail .grp[data-gid]").forEach((b) => {
    const n = unseen[b.dataset.gid] || 0;
    let t = b.querySelector(":scope > .rp-badge");
    if (!n) { if (t) t.remove(); return; }
    if (!t) {
      t = document.createElement("span");
      t.className = "rp-badge";
      t.textContent = "@";
      b.append(t);
    }
    b.style.position = "relative";
  });
}
async function onMsg(m) {
  const me = R().uid;
  if (!me || m.user_id === me || !PING.test(m.content || "")) return;
  const k = String(m.id);
  if (seenMsgs.has(k)) return;
  seenMsgs.add(k);
  if (blockedIds.has(m.user_id)) return;
  const gid = await groupOf(m.channel_id);
  if (!gid) return;
  const watching = R().gid === gid && !document.hidden && document.hasFocus();
  if (watching && R().cid === m.channel_id) return;
  unseen[gid] = (unseen[gid] || 0) + 1;
  paintBadges();
  if (window.rallyDnd) return;
  const [p, g] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", m.user_id).maybeSingle(),
    supabase.from("groups").select("name").eq("id", gid).maybeSingle(),
  ]);
  const who = (p.data && p.data.username) || "An admin";
  const gname = (g.data && g.data.name) || "a server";
  toast("📣 " + who + " pinged everyone in " + gname);
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    try { new Notification("@everyone in " + gname, { body: who + ": " + (m.content || "").slice(0, 100) }); } catch (e) { /* ignore */ }
  }
}
function startLive() {
  if (live) return;
  loadBlocked();
  clearInterval(blockTimer);
  blockTimer = setInterval(loadBlocked, 60000);
  live = supabase
    .channel("everyone-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onMsg(p.new))
    .subscribe();
}
function stopLive() {
  if (live) { supabase.removeChannel(live); live = null; }
  clearInterval(blockTimer);
}
supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => (s && s.user ? startLive() : stopLive()), 0); });
supabase.auth.getSession().then(({ data }) => { if (data.session) startLive(); });
new MutationObserver(paintBadges).observe($("rail"), { childList: true });
setInterval(() => {
  const g = R().gid;
  if (g && unseen[g] && !document.hidden && document.hasFocus()) { delete unseen[g]; }
  paintBadges();
}, 1000);