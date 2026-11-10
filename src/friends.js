import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const COL = ["#ffb547", "#ff5c8a", "#7fd6ff", "#b69cff", "#8be28b"];
const PK = "rally-pings";
const SEL = "id,username,color,avatar_url,presence,last_seen,status";
let uid = null, tab = "online", fr = [], blockedIds = [], profs = {}, live = null, msgLive = null, timer = null;
let incoming = 0, myRe = null, blockedSet = new Set();
let pings = {};
try { pings = JSON.parse(localStorage.getItem(PK) || "{}"); } catch (e) { pings = {}; }
const chanGroup = new Map(), authors = new Map();

const css = document.createElement("style");
css.textContent = `
#rail .logo{position:relative;cursor:pointer;display:grid;place-items:center}
.rbadge{position:absolute;right:-6px;bottom:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#ed4245;color:#fff;font:800 11px var(--body);display:grid;place-items:center;border:3px solid var(--rail);box-sizing:border-box;line-height:1;pointer-events:none;z-index:2}
.frov{position:fixed;inset:0;z-index:47;display:none;flex-direction:column;background:var(--bg);padding-top:env(safe-area-inset-top,0px)}
.frov.on{display:flex}
.frhead{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel)}
.frt{font:800 17px var(--head);margin-right:10px}
.frtabs{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.frtabs button{padding:6px 12px;border-radius:8px;color:var(--muted);font-weight:600;position:relative}
.frtabs button:hover{background:var(--raised);color:var(--text)}
.frtabs button.on{background:var(--raised);color:var(--text)}
.frtabs button.add{background:#3ba55d;color:#fff}
.frtabs button.add.on{background:#2d7d46}
.frtabs i{font-style:normal;background:#ed4245;color:#fff;border-radius:999px;font-size:11px;padding:1px 6px;margin-left:6px}
.frx{padding:6px 12px;border-radius:8px;color:var(--muted)}
.frx:hover{background:var(--raised);color:var(--text)}
.frbody{flex:1;overflow-y:auto;padding:16px;max-width:900px;width:100%;margin:0 auto}
.frsearch{width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit;margin-bottom:14px}
.frh{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--muted);text-transform:uppercase;margin:14px 0 6px}
.frrow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;border-top:1px solid var(--line)}
.frrow:hover{background:var(--raised)}
.fra{position:relative;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font:800 16px var(--head);color:#10121d;flex:none;background-size:cover;background-position:center}
.frd{position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:50%;border:3px solid var(--bg);box-sizing:border-box}
.frd.on{background:#3ddc84}.frd.idle{background:#ffc247}.frd.dnd{background:#ff4d6d}.frd.off{background:#6b7080}
.fri{flex:1;min-width:0}
.fri b{display:block;font-weight:600;overflow-wrap:anywhere}
.fri small{color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.frbtns{display:flex;gap:6px}
.frbtns button{padding:6px 12px;border-radius:999px;background:var(--panel);color:var(--text);font-weight:600;font-size:13px}
.frbtns button.go{background:#3ba55d;color:#fff}
.frbtns button.red:hover{background:#ed4245;color:#fff}
.fradd{max-width:520px}
.fradd p{color:var(--muted);font-size:14px}
.fradd form,.fradd .fl{display:flex;gap:8px}
.fradd input{flex:1;min-width:0;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
.fradd button{padding:0 18px;border-radius:10px;background:#3ba55d;color:#fff;font-weight:700}
.frempty{color:var(--muted);padding:30px 10px;text-align:center}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="frov" id="frov" role="dialog" aria-modal="true" aria-label="Friends">
  <div class="frhead"><span class="frt">👥 Friends</span><nav class="frtabs" id="frtabs"></nav><button class="frx" id="frclose" aria-label="Close">✕</button></div>
  <div class="frbody"><input class="frsearch" id="frsearch" placeholder="Search friends" autocomplete="off"><div id="frlist"></div></div>
</div>`);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 3000);
}
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function dot(p) {
  if (!p || p.presence === "invisible") return "off";
  if (p.presence === "dnd") return "dnd";
  if (p.presence === "idle") return "idle";
  const t = p.last_seen ? new Date(p.last_seen).getTime() : 0;
  return Date.now() - t < 180000 ? "on" : "off";
}
const LABEL = { on: "Online", idle: "Idle", dnd: "Do not disturb", off: "Offline" };

function derive() {
  const friends = [], inc = [], out = [];
  fr.forEach((r) => {
    const other = r.user_a === uid ? r.user_b : r.user_a;
    if (r.status === "accepted") friends.push(other);
    else if (r.user_b === uid) inc.push(other);
    else out.push(other);
  });
  return { friends, inc, out };
}
async function load() {
  if (!uid) return;
  const [a, b] = await Promise.all([
    supabase.from("friendships").select("user_a,user_b,status,created_at"),
    supabase.from("blocks").select("blocked_id"),
  ]);
  fr = a.data || [];
  blockedIds = (b.data || []).map((x) => x.blocked_id);
  blockedSet = new Set(blockedIds);
  const d = derive();
  incoming = d.inc.length;
  const ids = [...new Set([...d.friends, ...d.inc, ...d.out, ...blockedIds])];
  if (ids.length) {
    const { data } = await supabase.from("profiles").select(SEL).in("id", ids);
    (data || []).forEach((p) => (profs[p.id] = p));
  }
  paintBadges();
  if ($("frov").classList.contains("on")) render();
}

function avatar(p) {
  const a = h("div", "fra", ((p && p.username) || "?")[0].toUpperCase());
  a.style.background = (p && p.color) || COL[0];
  if (p && p.avatar_url) {
    a.style.backgroundImage = 'url("' + p.avatar_url + '")';
    a.style.backgroundSize = "cover";
    a.style.backgroundPosition = "center";
    a.style.color = "transparent";
  }
  return a;
}
function row(id, buttons, showDot) {
  const p = profs[id] || { username: "Unknown" };
  const r = h("div", "frrow");
  const a = avatar(p);
  const st = dot(p);
  if (showDot) a.append(h("i", "frd " + st));
  const info = h("div", "fri");
  info.append(h("b", "", p.username));
  const sub = showDot ? LABEL[st] + (p.status ? " · " + p.status : "") : "";
  if (sub) info.append(h("small", "", sub));
  const bt = h("div", "frbtns");
  buttons.forEach(([label, cls, fn]) => {
    const b = h("button", cls, label);
    b.onclick = fn;
    bt.append(b);
  });
  r.append(a, info, bt);
  return r;
}
function sorted(ids) {
  const rank = { on: 0, dnd: 1, idle: 2, off: 3 };
  return ids.slice().sort((x, y) => rank[dot(profs[x])] - rank[dot(profs[y])] || ((profs[x] || {}).username || "").localeCompare((profs[y] || {}).username || ""));
}
function match(id) {
  const q = $("frsearch").value.trim().toLowerCase();
  return !q || ((profs[id] || {}).username || "").toLowerCase().includes(q);
}

async function message(id) {
  const { data, error } = await supabase.rpc("start_dm", { p_user: id });
  if (error) return toast("You cannot message this person right now.");
  $("frov").classList.remove("on");
  document.dispatchEvent(new CustomEvent("rally-open-dm", { detail: { thread: data } }));
}
async function act(fn, ok) {
  const { error } = await fn();
  if (error) return toast("Something went wrong. Try again.");
  if (ok) toast(ok);
  await load();
}

function renderTabs(d) {
  const t = $("frtabs");
  t.textContent = "";
  const onlineN = d.friends.filter((i) => dot(profs[i]) !== "off").length;
  [["online", "Online"], ["all", "All"], ["pending", "Pending"], ["blocked", "Blocked"]].forEach(([k, label]) => {
    const b = h("button", k === tab ? "on" : "", label);
    if (k === "pending" && d.inc.length) b.append(h("i", "", String(d.inc.length)));
    b.onclick = () => { tab = k; render(); };
    t.append(b);
  });
  const add = h("button", "add" + (tab === "add" ? " on" : ""), "Add Friend");
  add.onclick = () => { tab = "add"; render(); };
  t.append(add);
  return onlineN;
}
function render() {
  const d = derive();
  const onlineN = renderTabs(d);
  const list = $("frlist");
  list.textContent = "";
  $("frsearch").style.display = tab === "add" ? "none" : "";
  if (tab === "add") {
    const box = h("div", "fradd");
    box.append(h("div", "frh", "Add Friend"));
    box.append(h("p", "", "Type a Rally username. You can add people who share a server with you."));
    const form = h("form");
    const inp = h("input");
    inp.placeholder = "Enter a username";
    inp.maxLength = 20;
    inp.autocomplete = "off";
    const go = h("button", "", "Send Friend Request");
    go.type = "submit";
    const msg = h("p", "", "");
    form.append(inp, go);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const v = inp.value.trim();
      if (!v) return;
      go.disabled = true;
      const { data, error } = await supabase.rpc("send_friend_request", { p_username: v });
      go.disabled = false;
      if (error) {
        const m = error.message;
        msg.style.color = "var(--pink)";
        msg.textContent = m.includes("No user") ? "No one on Rally has that username." : m.includes("Self") ? "That is you!" : m.includes("Blocked") ? "You cannot send a request to that person." : m.includes("shared") || m.includes("share") ? "You can only add people who share a server with you." : m.includes("Already friends") ? "You are already friends." : m.includes("Already sent") ? "You already sent a request to that person." : m.includes("Too many") ? "You sent a lot of requests. Try again later." : "Could not send that request.";
        return;
      }
      msg.style.color = "var(--accent)";
      msg.textContent = data === "accepted" ? "You are now friends with " + v + "!" : "Friend request sent to " + v + ".";
      inp.value = "";
      load();
    };
    box.append(form, msg);
    list.append(box);
    return;
  }
  if (tab === "online" || tab === "all") {
    let ids = d.friends.filter(match);
    if (tab === "online") ids = ids.filter((i) => dot(profs[i]) !== "off");
    list.append(h("div", "frh", (tab === "online" ? "Online" : "All friends") + " - " + ids.length));
    if (!ids.length) list.append(h("div", "frempty", tab === "online" ? "Nobody is online right now." : "No friends yet. Click Add Friend to send a request."));
    sorted(ids).forEach((id) => list.append(row(id, [
      ["💬 Message", "", () => message(id)],
      ["Remove", "red", () => { if (confirm("Remove " + (profs[id] || {}).username + " from your friends?")) act(() => supabase.rpc("remove_friend", { p_user: id }), "Friend removed."); }],
    ], true)));
  } else if (tab === "pending") {
    const inc = d.inc.filter(match), out = d.out.filter(match);
    list.append(h("div", "frh", "Incoming - " + inc.length));
    inc.forEach((id) => list.append(row(id, [
      ["Accept", "go", () => act(() => supabase.rpc("respond_friend_request", { p_user: id, p_accept: true }), "Friend added!")],
      ["Decline", "red", () => act(() => supabase.rpc("respond_friend_request", { p_user: id, p_accept: false }))],
    ], false)));
    list.append(h("div", "frh", "Sent - " + out.length));
    out.forEach((id) => list.append(row(id, [["Cancel", "red", () => act(() => supabase.rpc("remove_friend", { p_user: id }), "Request cancelled.")]], false)));
    if (!inc.length && !out.length) list.append(h("div", "frempty", "No pending requests."));
  } else if (tab === "blocked") {
    const ids = blockedIds.filter(match);
    list.append(h("div", "frh", "Blocked - " + ids.length));
    if (!ids.length) list.append(h("div", "frempty", "You have not blocked anyone."));
    ids.forEach((id) => list.append(row(id, [["Unblock", "", () => act(() => supabase.from("blocks").delete().eq("blocker_id", uid).eq("blocked_id", id), "Unblocked.")]], false)));
  }
  void onlineN;
}

function openFriends() {
  $("frov").classList.add("on");
  tab = "online";
  $("frsearch").value = "";
  render();
  load();
  clearInterval(timer);
  timer = setInterval(() => { if ($("frov").classList.contains("on")) load(); else clearInterval(timer); }, 30000);
}
$("frclose").onclick = () => $("frov").classList.remove("on");
$("frsearch").oninput = render;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("frov").classList.remove("on"); });
document.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest("#rail .logo")) openFriends();
});

function setBadge(host, n) {
  let b = host.querySelector(":scope > .rbadge");
  if (n <= 0) { if (b) b.remove(); return; }
  if (!b) { b = h("span", "rbadge"); host.append(b); }
  host.style.position = "relative";
  b.textContent = n > 99 ? "99+" : String(n);
}
function dmUnread() {
  const i = document.querySelector(".dmbtn i");
  return i ? parseInt(i.textContent, 10) || 0 : 0;
}
function paintBadges() {
  const logo = document.querySelector("#rail .logo");
  if (logo) {
    logo.title = "Friends";
    setBadge(logo, incoming + dmUnread());
  }
  document.querySelectorAll("#rail .grp[data-gid]").forEach((b) => setBadge(b, pings[b.dataset.gid] || 0));
}
function savePings() { try { localStorage.setItem(PK, JSON.stringify(pings)); } catch (e) { /* ignore */ } }
new MutationObserver(paintBadges).observe($("rail"), { childList: true });
setInterval(() => {
  const g = window.rally && window.rally.gid;
  if (g && !document.hidden && document.hasFocus() && pings[g]) { delete pings[g]; savePings(); }
  paintBadges();
}, 1000);

async function authorOf(mid) {
  const k = String(mid);
  if (!authors.has(k)) {
    const { data } = await supabase.from("messages").select("user_id").eq("id", mid).maybeSingle();
    authors.set(k, data ? data.user_id : null);
  }
  return authors.get(k);
}
async function groupOf(cid) {
  if (!chanGroup.has(cid)) {
    const { data } = await supabase.from("channels").select("group_id").eq("id", cid).maybeSingle();
    chanGroup.set(cid, data ? data.group_id : null);
  }
  return chanGroup.get(cid);
}
async function onMsg(m) {
  if (!uid || m.user_id === uid || blockedSet.has(m.user_id)) return;
  let hit = false;
  if (m.reply_to && (await authorOf(m.reply_to)) === uid) hit = true;
  if (!hit && myRe && myRe.test(m.content || "")) hit = true;
  if (!hit) return;
  const gid = await groupOf(m.channel_id);
  if (!gid) return;
  const here = window.rally && window.rally.gid === gid && !document.hidden && document.hasFocus();
  if (here) return;
  pings[gid] = (pings[gid] || 0) + 1;
  savePings();
  paintBadges();
}

function subscribe() {
  if (live) return;
  live = supabase
    .channel("friends-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, async (p) => {
      await load();
      const n = p.new || {};
      if (p.eventType === "INSERT" && n.user_b === uid) toast(((profs[n.user_a] || {}).username || "Someone") + " sent you a friend request");
      if (p.eventType === "UPDATE" && n.user_a === uid && n.status === "accepted") toast(((profs[n.user_b] || {}).username || "Someone") + " accepted your friend request");
    })
    .subscribe();
  msgLive = supabase
    .channel("ping-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onMsg(p.new))
    .subscribe();
}
async function init(u) {
  if (!u) {
    uid = null;
    fr = [];
    incoming = 0;
    if (live) { supabase.removeChannel(live); live = null; }
    if (msgLive) { supabase.removeChannel(msgLive); msgLive = null; }
    $("frov").classList.remove("on");
    paintBadges();
    return;
  }
  if (uid === u.id) return;
  uid = u.id;
  const { data } = await supabase.from("profiles").select("username").eq("id", uid).maybeSingle();
  if (data) myRe = new RegExp("(^|\\W)@" + data.username + "(?![A-Za-z0-9_])", "i");
  await load();
  subscribe();
}
supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => init(s && s.user), 0); });
supabase.auth.getSession().then(({ data }) => init(data.session && data.session.user));