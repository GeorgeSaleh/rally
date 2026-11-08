import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const CALL_MARK = "📞 Started a call";
const KEY = "rally-notify";
const baseTitle = document.title;
const names = {}, authors = new Map(), chans = new Map();
let uid = null, myRe = null, blocked = new Set(), missed = 0, live = null;

function pref() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
function setPref(v) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) { /* ignore */ } }
function enabled() { return pref() && "Notification" in window && Notification.permission === "granted"; }
function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 3200);
}
function beep() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.4);
    setTimeout(() => c.close(), 700);
  } catch (e) { /* ignore */ }
}
function away() { return document.hidden || !document.hasFocus(); }
function notify(text) {
  if (away()) {
    missed++;
    document.title = "(" + missed + ") " + baseTitle;
  } else {
    toast(text);
  }
  if (enabled()) {
    if (away()) {
      try {
        const n = new Notification("Rally", { body: text, tag: "rally", icon: "/favicon.svg" });
        n.onclick = () => { window.focus(); n.close(); };
      } catch (e) { /* some phones do not allow this */ }
    }
    beep();
  }
}
function reset() { missed = 0; document.title = baseTitle; }
document.addEventListener("visibilitychange", () => { if (!document.hidden) reset(); });
window.addEventListener("focus", reset);

async function nameOf(id) {
  if (!names[id]) {
    const { data } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
    names[id] = data ? data.username : "Someone";
  }
  return names[id];
}
async function authorOf(mid) {
  const k = String(mid);
  if (!authors.has(k)) {
    const { data } = await supabase.from("messages").select("user_id").eq("id", mid).maybeSingle();
    authors.set(k, data ? data.user_id : null);
  }
  return authors.get(k);
}
async function chanName(id) {
  if (!chans.has(id)) {
    const { data } = await supabase.from("channels").select("name").eq("id", id).maybeSingle();
    chans.set(id, data ? data.name : "");
  }
  return chans.get(id);
}
async function loadBlocks() {
  const { data } = await supabase.from("blocks").select("blocked_id");
  blocked = new Set((data || []).map((x) => x.blocked_id));
}

async function onMessage(m) {
  if (!uid || m.user_id === uid || blocked.has(m.user_id)) return;
  let kind = null;
  if (m.reply_to && (await authorOf(m.reply_to)) === uid) kind = "replied to you";
  if (!kind && myRe && myRe.test(m.content || "")) kind = "mentioned you";
  if (!kind) return;
  const looking = !away() && window.rally && window.rally.cid === m.channel_id;
  if (looking) return;
  const who = await nameOf(m.user_id);
  const ch = await chanName(m.channel_id);
  notify(who + " " + kind + (ch ? " in #" + ch : ""));
}
async function onDm(m) {
  if (!uid || m.sender === uid || blocked.has(m.sender)) return;
  const ov = $("dmov");
  const open = ov && ov.classList.contains("on") && ov.dataset.thread === m.thread_id && !away();
  if (open) return;
  const who = await nameOf(m.sender);
  notify(m.content === CALL_MARK ? who + " is calling you" : "New message from " + who);
}
function subscribe() {
  if (live) return;
  live = supabase
    .channel("notify-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onMessage(p.new))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (p) => onDm(p.new))
    .subscribe();
}
async function init(u) {
  if (!u) {
    uid = null;
    myRe = null;
    if (live) { supabase.removeChannel(live); live = null; }
    return;
  }
  if (uid === u.id) return;
  uid = u.id;
  const { data } = await supabase.from("profiles").select("username").eq("id", uid).maybeSingle();
  if (data) myRe = new RegExp("(^|\\W)@" + data.username + "(?![A-Za-z0-9_])", "i");
  await loadBlocks();
  subscribe();
}
supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => init(s && s.user), 0); });
supabase.auth.getSession().then(({ data }) => init(data.session && data.session.user));
window.addEventListener("focus", loadBlocks);

const bell = document.createElement("button");
bell.id = "bellbtn";
bell.style.cssText = "margin-left:auto;font-size:16px;color:var(--muted)";
function renderBell() {
  bell.textContent = enabled() ? "🔔" : "🔕";
  bell.title = enabled() ? "Notifications on (click to turn off)" : "Turn on notifications";
  bell.setAttribute("aria-label", bell.title);
}
bell.onclick = async () => {
  if (!("Notification" in window)) return toast("This browser does not support notifications.");
  if (Notification.permission === "denied") return toast("Notifications are blocked. Allow them in your browser's site settings.");
  if (enabled()) { setPref(false); renderBell(); return toast("Notifications off."); }
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm === "granted") { setPref(true); renderBell(); toast("Notifications on."); beep(); }
  else toast("Notifications were not allowed.");
};
const gear = document.querySelector(".gear");
if (gear) { gear.before(bell); gear.style.marginLeft = "4px"; } else $("theme").before(bell);
renderBell();