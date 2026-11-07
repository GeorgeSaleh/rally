import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const COL = ["#ffb547", "#ff5c8a", "#7fd6ff", "#b69cff", "#8be28b"];
const names = {};
const shownDm = new Set();
let me = null, threads = [], current = null, blocked = new Set(), unread = new Set(), live = null, sending = false, repMsg = null;

const css = document.createElement("style");
css.textContent = `
.dmbtn{display:block;width:calc(100% - 16px);margin:6px 8px;text-align:left;padding:9px 12px;border-radius:10px;background:var(--raised);color:var(--text);font-weight:600}
.dmbtn i{font-style:normal;float:right;color:var(--pink)}
.dmov{position:fixed;inset:0;z-index:45;background:var(--bg);display:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
.dmov.on{display:flex}
.dml{width:270px;border-right:1px solid var(--line);display:flex;flex-direction:column;background:var(--panel);min-height:0}
.dml h2{margin:0;padding:14px 16px;font:800 18px var(--head);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.dml h2 button,.dmh button{color:var(--muted);padding:4px 10px;border-radius:8px}
.dml h2 button:hover,.dmh button:hover{background:var(--raised);color:var(--text)}
.dmlist{overflow-y:auto;flex:1;padding:8px}
.dmrow{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px;border-radius:10px}
.dmrow:hover,.dmrow[aria-current=true]{background:var(--raised)}
.dmrow .dot{width:9px;height:9px;border-radius:50%;background:var(--pink);margin-left:auto}
.dmnone{color:var(--muted);padding:12px;font-size:14px}
.dmc{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.dmh{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line)}
.dmh h3{margin:0;font:800 17px var(--head);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dmbk{display:none}
.dmm{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.dmin{display:flex;gap:8px;padding:0 16px 16px}
.dmin input{flex:1;min-width:0;background:var(--raised);border:1px solid var(--line);color:var(--text);padding:12px 14px;border-radius:12px;font:inherit}
.dmin button{background:var(--accent);color:var(--on-accent);font-weight:600;padding:0 18px;border-radius:12px}
.dmin button:disabled,.dmin input:disabled{opacity:.5}
@media (max-width:760px){.dml{width:100%}.dmov.chat .dml{display:none}.dmov:not(.chat) .dmc{display:none}.dmbk{display:inline-block}}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="dmov" id="dmov">
  <aside class="dml"><h2><span>Messages</span><button id="dmclose">Close</button></h2><div class="dmlist" id="dmlist"></div></aside>
  <section class="dmc">
    <div class="dmh"><button id="dmback" class="dmbk">Back</button><h3 id="dmname">Messages</h3><button id="dmblock" hidden>Block</button></div>
    <div class="dmm" id="dmmsgs"><p class="dmnone">Pick a conversation, or click Message next to someone in a group.</p></div>
    <div class="dmin"><input id="dmtext" placeholder="Message" maxlength="2000" autocomplete="off" disabled><button id="dmsend">Send</button></div>
  </section>
</div>
<div class="ov" id="dmrepov" style="z-index:60"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dmrt">
  <h2 id="dmrt">Report message</h2>
  <p class="sub">Reports go to the Rally owner. Group admins cannot read private messages.</p>
  <div class="quote"><b id="dmrwho"></b><span id="dmrtxt"></span></div>
  <label class="lb" for="dmrreason">What is the problem?</label>
  <select id="dmrreason" style="width:100%;margin-bottom:12px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit">
    <option>Harassment or bullying</option><option>Hate or discrimination</option><option>Threats or violence</option><option>Sexual content</option><option>Spam or scams</option><option>Something else</option>
  </select>
  <label class="lb" for="dmrdesc">What was offensive or harmful about it?</label>
  <textarea id="dmrdesc" maxlength="500" placeholder="Explain what happened (at least 20 characters)."></textarea>
  <div class="row"><button class="cancel" id="dmrcancel">Cancel</button><button class="go" id="dmrgo">Send report</button></div>
</div></div>`);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2400);
}
function nm(id) { return names[id] || { username: "Unknown", color: COL[0] }; }
function av(p) {
  const s = document.createElement("span");
  s.className = "av";
  s.style.background = p.color || COL[0];
  s.textContent = (p.username || "?")[0].toUpperCase();
  return s;
}
function fmt(iso) {
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + t;
}
async function loadNames(ids) {
  const need = [...new Set(ids)].filter((i) => !names[i]);
  if (!need.length) return;
  const { data } = await supabase.from("profiles").select("id,username,color").in("id", need);
  (data || []).forEach((p) => (names[p.id] = p));
}
async function loadBlocks() {
  const { data } = await supabase.from("blocks").select("blocked_id");
  blocked = new Set((data || []).map((x) => x.blocked_id));
}

const dmBtn = document.createElement("button");
dmBtn.className = "dmbtn";
document.querySelector(".side .code").after(dmBtn);
function badge() {
  dmBtn.textContent = "Messages";
  if (unread.size) {
    const i = document.createElement("i");
    i.textContent = String(unread.size);
    dmBtn.append(i);
  }
}
badge();

function drawList() {
  const l = $("dmlist");
  l.textContent = "";
  if (!threads.length) {
    const p = document.createElement("p");
    p.className = "dmnone";
    p.textContent = "No conversations yet. Open a group's member list and click Message next to someone.";
    l.append(p);
    return;
  }
  threads.forEach((t) => {
    const p = nm(t.other);
    const b = document.createElement("button");
    b.className = "dmrow";
    b.setAttribute("aria-current", t.id === current);
    b.append(av(p), p.username);
    if (unread.has(t.id)) {
      const d = document.createElement("span");
      d.className = "dot";
      b.append(d);
    }
    b.onclick = () => openThread(t.id);
    l.append(b);
  });
}
async function loadThreads() {
  const { data, error } = await supabase.from("dm_threads").select("id,user_a,user_b,last_at").order("last_at", { ascending: false });
  if (error) return toast("Could not load your messages.");
  threads = (data || []).map((t) => ({ id: t.id, other: t.user_a === me ? t.user_b : t.user_a }));
  await loadNames(threads.map((t) => t.other).concat(me));
  drawList();
}
function syncBlock() {
  const t = threads.find((x) => x.id === current);
  const bb = $("dmblock");
  bb.hidden = !t;
  if (!t) return;
  const isB = blocked.has(t.other);
  bb.textContent = isB ? "Unblock" : "Block";
  $("dmtext").disabled = isB;
  $("dmsend").disabled = isB;
  $("dmtext").placeholder = isB ? "You blocked this person" : "Message";
}
function dmEl(m) {
  const mine = m.sender === me;
  const p = nm(m.sender);
  const el = document.createElement("div");
  el.className = "m" + (mine ? " mine" : "");
  el.dataset.id = String(m.id);
  const b = document.createElement("div");
  b.className = "b";
  const h = document.createElement("div");
  const n = document.createElement("span");
  n.className = "n";
  n.textContent = p.username;
  const tm = document.createElement("span");
  tm.className = "t";
  tm.textContent = fmt(m.created_at);
  h.append(n, tm);
  const pe = document.createElement("p");
  pe.textContent = m.content;
    b.append(h, pe);
  if (m.content === "📞 Started a call") {
    const j = document.createElement("button");
    j.textContent = "Join call";
    j.style.cssText = "margin-top:6px;padding:6px 14px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700";
    j.onclick = () => window.rallyCall && window.rallyCall.joinDm(m.thread_id, $("dmname").textContent);
    b.append(j);
  }
  if (!mine) {
    const a = document.createElement("div");
    a.className = "act";
    const r = document.createElement("button");
    r.textContent = "Report";
    r.onclick = () => openRep(m, p.username);
    a.append(r);
    b.append(a);
  }
  el.append(av(p), b);
  return el;
}
function addDm(m, scroll) {
  const key = String(m.id);
  if (shownDm.has(key) || blocked.has(m.sender)) return;
  shownDm.add(key);
  const box = $("dmmsgs");
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.append(dmEl(m));
  if (scroll && (near || m.sender === me)) box.scrollTop = box.scrollHeight;
}
async function openThread(id) {
  current = id;
  unread.delete(id);
    $("dmov").dataset.thread = id;
  badge();
  $("dmov").classList.add("chat");
  drawList();
  const t = threads.find((x) => x.id === id);
  if (!t) return;
  $("dmname").textContent = nm(t.other).username;
  syncBlock();
  const box = $("dmmsgs");
  box.textContent = "";
  shownDm.clear();
  const { data, error } = await supabase
    .from("dm_messages")
    .select("id,thread_id,sender,content,created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (id !== current) return;
  if (error) return toast("Could not load this conversation.");
  await loadNames((data || []).map((m) => m.sender));
  (data || []).reverse().forEach((m) => addDm(m, false));
  box.scrollTop = box.scrollHeight;
}
async function openOverlay() {
  await loadBlocks();
  await loadThreads();
  $("dmov").classList.add("on");
  if (!current) $("dmov").classList.remove("chat");
}
function closeOverlay() {
  $("dmov").classList.remove("on");
}
dmBtn.onclick = openOverlay;
$("dmclose").onclick = closeOverlay;
$("dmback").onclick = () => {
  $("dmov").classList.remove("chat");
  current = null;
  drawList();
};

async function sendDm() {
  const v = $("dmtext");
  const t = v.value.trim();
  if (!t || !current || !me || sending) return;
  sending = true;
  v.value = "";
  const { data, error } = await supabase
    .from("dm_messages")
    .insert({ thread_id: current, sender: me, content: t })
    .select("id,thread_id,sender,content,created_at")
    .single();
  sending = false;
  if (error) {
    v.value = t;
    return toast(error.message.includes("Slow down") ? "You are sending messages too fast." : "Could not send. They may have blocked you, or you no longer share a group.");
  }
  addDm(data, true);
}
$("dmsend").onclick = sendDm;
$("dmtext").onkeydown = (e) => { if (e.key === "Enter") sendDm(); };

$("dmblock").onclick = async () => {
  const t = threads.find((x) => x.id === current);
  if (!t) return;
  if (blocked.has(t.other)) {
    const { error } = await supabase.from("blocks").delete().eq("blocker_id", me).eq("blocked_id", t.other);
    if (error) return toast("Could not unblock.");
    blocked.delete(t.other);
  } else {
    if (!confirm("Block " + nm(t.other).username + "? You will stop seeing their messages and neither of you can send new ones.")) return;
    const { error } = await supabase.from("blocks").insert({ blocker_id: me, blocked_id: t.other });
    if (error && error.code !== "23505") return toast("Could not block.");
    blocked.add(t.other);
  }
  await openThread(current);
};

function openRep(m, who) {
  repMsg = m;
  $("dmrwho").textContent = who + " wrote:";
  $("dmrtxt").textContent = m.content;
  $("dmrdesc").value = "";
  $("dmrepov").classList.add("on");
}
$("dmrcancel").onclick = () => $("dmrepov").classList.remove("on");
$("dmrgo").onclick = async () => {
  const d = $("dmrdesc").value.trim();
  if (d.length < 20) return toast("Please write at least 20 characters about what happened.");
  $("dmrgo").disabled = true;
  const { error } = await supabase.rpc("report_dm", { msg_id: repMsg.id, p_reason: $("dmrreason").value, p_description: d });
  $("dmrgo").disabled = false;
  if (error) return toast(error.message.includes("Already") ? "You already reported that message." : "Could not send the report.");
  $("dmrepov").classList.remove("on");
  toast("Report sent. Thank you.");
};

async function startDm(uid) {
  const { data, error } = await supabase.rpc("start_dm", { p_user: uid });
  if (error) {
    return toast(error.message.includes("shared") ? "You can only message people who share a group with you." : error.message.includes("Blocked") ? "You cannot message this person." : "Could not start that conversation.");
  }
  await loadBlocks();
  await loadThreads();
  $("dmov").classList.add("on");
  openThread(data);
}
new MutationObserver(() => {
  document.querySelectorAll("#memlist > div[data-user] .mact").forEach((box) => {
    if (box.querySelector(".mdm")) return;
    const b = document.createElement("button");
    b.className = "mb mdm";
    b.textContent = "Message";
    b.onclick = () => startDm(box.parentElement.dataset.user);
    box.prepend(b);
  });
}).observe($("memlist"), { childList: true });

function subscribe() {
  if (live) return;
  live = supabase
    .channel("dm-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, async (p) => {
      const m = p.new;
      if (blocked.has(m.sender)) return;
            if (m.content === "📞 Started a call" && m.sender !== me) {
        document.dispatchEvent(new CustomEvent("rally-call-invite", { detail: { thread: m.thread_id, from: m.sender } }));
      }
      await loadNames([m.sender]);
      if (!threads.some((t) => t.id === m.thread_id)) await loadThreads();
      if (m.thread_id === current && $("dmov").classList.contains("on")) {
        addDm(m, true);
      } else if (m.sender !== me) {
        unread.add(m.thread_id);
        badge();
      }
      const i = threads.findIndex((t) => t.id === m.thread_id);
      if (i > 0) threads.unshift(threads.splice(i, 1)[0]);
      drawList();
    })
    .subscribe();
}
async function init(u) {
  if (!u) {
    me = null; threads = []; current = null; unread = new Set(); blocked = new Set();
    closeOverlay();
    badge();
    if (live) { supabase.removeChannel(live); live = null; }
    return;
  }
  if (me === u.id) return;
  me = u.id;
  await loadBlocks();
  await loadThreads();
  subscribe();
}
supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => init(s && s.user), 0); });
supabase.auth.getSession().then(({ data }) => init(data.session && data.session.user));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("dmrepov").classList.remove("on"); closeOverlay(); }
});