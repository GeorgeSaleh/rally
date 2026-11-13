import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};

let rank = "none";
let slow = 0, slowCid = null, lastSent = 0, cdTimer = null;
let shownPin = null, bannerToken = 0;
const dismissed = new Set();

const css = document.createElement("style");
css.textContent = `
.rz-banner{display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--raised);border-left:3px solid var(--accent);border-bottom:1px solid var(--line);cursor:pointer;min-width:0}
.rz-banner[hidden]{display:none}
.rz-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.rz-text b{margin-right:6px}
.rz-x{flex:none;padding:2px 8px;border-radius:8px;color:var(--muted)}
.rz-x:hover{background:var(--panel);color:var(--text)}`;
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
}
supabase.auth.onAuthStateChange(() => { setTimeout(checkRank, 0); });
checkRank();

const exempt = () => R().role === "admin" || rank !== "none";

// ================= PINNED MESSAGE BANNER =================
const banner = document.createElement("div");
banner.className = "rz-banner";
banner.hidden = true;
banner.title = "Jump to the pinned message";
const pinIcon = document.createElement("span");
pinIcon.textContent = "📌";
const text = document.createElement("div");
text.className = "rz-text";
const who = document.createElement("b");
const body = document.createElement("span");
text.append(who, body);
const closeBtn = document.createElement("button");
closeBtn.className = "rz-x";
closeBtn.textContent = "✕";
closeBtn.setAttribute("aria-label", "Hide this pinned message");
banner.append(pinIcon, text, closeBtn);
$("msgs").before(banner);

async function loadBanner() {
  const my = ++bannerToken;
  const cid = R().cid;
  if (!cid) { banner.hidden = true; shownPin = null; return; }
  const { data, error } = await supabase
    .from("messages")
    .select("id,user_id,content")
    .eq("channel_id", cid)
    .not("pinned_at", "is", null)
    .order("pinned_at", { ascending: false })
    .limit(1);
  if (my !== bannerToken || cid !== R().cid) return;
  if (error || !data || !data.length || dismissed.has(String(data[0].id))) {
    banner.hidden = true;
    shownPin = null;
    return;
  }
  const m = data[0];
  const { data: p } = await supabase.from("profiles").select("username").eq("id", m.user_id).maybeSingle();
  if (my !== bannerToken) return;
  shownPin = String(m.id);
  who.textContent = ((p && p.username) || "Unknown") + ":";
  body.textContent = m.content;
  banner.hidden = false;
}

banner.onclick = () => {
  if (!shownPin) return;
  const el = $("msgs").querySelector('[data-id="' + shownPin + '"]');
  if (!el) return toast("That pinned message is older than the 100 most recent ones.");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 2000);
};
closeBtn.onclick = (e) => {
  e.stopPropagation();
  if (shownPin) dismissed.add(shownPin);
  banner.hidden = true;
};
// After someone clicks Pin or Unpin, refresh the banner
document.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest(".rpin-toggle, .rpin-acts button")) setTimeout(loadBanner, 800);
});

// ================= SLOW MODE =================
function cooling() {
  return slow > 0 && !exempt() && Date.now() - lastSent < slow * 1000;
}
function endCd() {
  clearInterval(cdTimer);
  cdTimer = null;
  const inp = $("inp");
  if (inp.disabled) return; // another feature (timeout or read-only) has the box locked
  $("send").disabled = false;
  if (inp.placeholder.startsWith("Slow mode")) {
    inp.placeholder = "Message #" + $("cname").textContent.replace(/^#\s*/, "");
  }
}
function tick() {
  if (!cooling()) return endCd();
  const left = Math.ceil(slow - (Date.now() - lastSent) / 1000);
  $("send").disabled = true;
  $("inp").placeholder = "Slow mode: wait " + left + "s";
}
function startCd() {
  clearInterval(cdTimer);
  if (!cooling()) return endCd();
  tick();
  cdTimer = setInterval(tick, 500);
}

async function loadSlow() {
  const cid = R().cid, uid = R().uid;
  if (cid !== slowCid) {
    slowCid = cid;
    slow = 0;
    lastSent = 0;
    endCd();
  }
  if (!cid) return;
  const { data } = await supabase.from("channels").select("slow_seconds").eq("id", cid).maybeSingle();
  if (cid !== R().cid) return;
  slow = (data && data.slow_seconds) || 0;
  if (slow > 0 && uid) {
    const { data: mm } = await supabase
      .from("messages")
      .select("created_at")
      .eq("channel_id", cid)
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1);
    if (cid !== R().cid) return;
    if (mm && mm[0]) lastSent = new Date(mm[0].created_at).getTime();
    startCd();
  } else {
    endCd();
  }
}

// Handles: /slowmode 10   /slowmode off
function slowCmd() {
  const m = $("inp").value.trim().match(/^\/slowmode(?:\s+(.*))?$/i);
  if (!m) return false;
  $("inp").value = "";
  const arg = (m[1] || "").trim().toLowerCase();
  const secs = arg === "off" ? 0 : parseInt(arg, 10);
  if (Number.isNaN(secs) || secs < 0 || secs > 21600) {
    toast("Try /slowmode 10 (seconds, up to 21600) or /slowmode off");
    return true;
  }
  supabase.rpc("set_channel_slowmode", { p_channel: R().cid, p_seconds: secs }).then(({ error }) => {
    if (error) return toast(error.message.includes("Only admins") ? "Only admins can do that." : "Could not change that. Did you run the SQL?");
    toast(secs ? "Slow mode: one message every " + secs + " seconds." : "Slow mode is off.");
    loadSlow();
  });
  return true;
}

// Runs before Rally's own send handlers (the "true" at the end)
function gate(e) {
  if (e.type === "keydown" && (e.key !== "Enter" || e.isComposing)) return;
  if (slowCmd()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  const v = $("inp").value.trim();
  if (!v || v.startsWith("/") || slow <= 0 || exempt()) return;
  if (cooling()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return toast("Slow mode is on. Wait a moment.");
  }
  lastSent = Date.now();
  setTimeout(startCd, 0);
}
$("inp").addEventListener("keydown", gate, true);
$("send").addEventListener("click", gate, true);

// ================= KEEP EVERYTHING FRESH =================
new MutationObserver(() => { loadBanner(); loadSlow(); }).observe($("cname"), { childList: true, characterData: true, subtree: true });
setInterval(() => { if (!document.hidden) { loadBanner(); loadSlow(); } }, 30000);