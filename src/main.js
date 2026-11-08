import "./style.css";
import "./auth.js";
import "./profile.js";
import "./dm.js";
import "./settings.js";
import "./admin.js";
import "./typing.js";
import "./groupsettings.js";
import "./replies.js";
import "./call.js";
import "./polish.js";
import "./profiles.js";
import "./directory.js";
import "./notifications.js";
import "./reactions.js";
import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const COL = ["#ffb547", "#ff5c8a", "#7fd6ff", "#b69cff", "#8be28b"];
const prof = {};
const shown = new Set();
let me = null, myRole = "member", groups = [], channels = [], curMembers = [], blocked = new Set(), gid = null, cid = null, live = null, sending = false;

const css = document.createElement("style");
css.textContent = `
.dlg input.tx{display:block;width:100%;margin:6px 0 12px;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
.dlg .tabs{display:flex;gap:6px;background:var(--raised);padding:4px;border-radius:12px;margin:10px 0 14px}
.dlg .tabs button{flex:1;padding:8px;border-radius:9px;color:var(--muted);font-weight:600}
.dlg .tabs button.on{background:var(--accent);color:var(--on-accent)}
.dlg .go.amber{background:var(--accent);color:var(--on-accent)}
.gmsg{min-height:20px;font-size:14px;color:var(--pink);margin:0 0 6px}
.empty{margin:auto;text-align:center;color:var(--muted);max-width:320px}
.empty h2{color:var(--text);font:800 20px var(--head);margin:0 0 6px}
.empty button{margin:12px 6px 0;background:var(--accent);color:var(--on-accent);font-weight:700;padding:10px 16px;border-radius:12px}
.m .act button.del:hover,.m .act button.sure{color:#fff;background:var(--pink)}
.editbox{display:flex;gap:6px;margin-top:4px;max-width:520px}
.editbox input{flex:1;min-width:0;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
.editbox button{padding:6px 12px;border-radius:10px;background:var(--raised);color:var(--text);font-weight:600}
.editbox button:first-of-type{background:var(--accent);color:var(--on-accent)}
.ed{font-size:12px;color:var(--muted)}
#memlist>div{flex-wrap:wrap}
.mact{flex-basis:100%;display:flex;gap:6px;margin:0 0 4px 44px}
.mb{font-size:11px;padding:2px 8px;border-radius:8px;background:var(--raised);color:var(--muted)}
.mb:hover{color:var(--text)}
.rep-item{background:var(--raised);border-left:3px solid var(--pink);border-radius:8px;padding:10px;margin-bottom:10px;font-size:14px;overflow-wrap:anywhere}
.rep-item b{display:block;margin-bottom:4px}
.rep-item .acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.rep-item .acts button{padding:5px 10px;border-radius:8px;background:var(--panel);color:var(--text);font-weight:600;font-size:13px}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="gov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="gt">
<h2 id="gt">Add a group</h2>
<div class="tabs"><button type="button" id="gt-create" class="on">Create</button><button type="button" id="gt-join">Join</button></div>
<label class="lb" for="gin" id="glabel">Group name</label>
<input class="tx" id="gin" maxlength="40" autocomplete="off">
<p class="gmsg" id="gmsg" role="status"></p>
<div class="row"><button class="cancel" id="gcancel">Cancel</button><button class="go amber" id="ggo">Create group</button></div>
</div></div>
<div class="ov" id="repov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="rept">
<h2 id="rept">Open reports</h2>
<div id="replist"></div>
<div class="row"><button class="cancel" id="repclose">Close</button></div>
</div></div>`);

function toast(t) {
  const e = $("toast");
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2200);
}
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
  return d.toDateString() === new Date().toDateString()
    ? t
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + t;
}
async function who(uid) {
  if (!prof[uid]) {
    const { data } = await supabase.from("profiles").select("id,username,color").eq("id", uid).maybeSingle();
    prof[uid] = data || { id: uid, username: "Unknown", color: COL[0] };
  }
  return prof[uid];
}

function drawRail() {
  const r = $("rail");
  r.textContent = "";
  const l = document.createElement("div");
  l.className = "logo";
    const im = document.createElement("img");
  im.src = "/favicon.svg";
  im.alt = "Rally";
  im.width = 40;
  im.height = 40;
  l.append(im);
  r.append(l);
  groups.forEach((g) => {
    const b = document.createElement("button");
    b.className = "grp";
    b.textContent = g.name[0].toUpperCase();
    b.title = g.name;
    b.setAttribute("aria-label", g.name);
    b.setAttribute("aria-current", g.id === gid);
    b.onclick = () => openGroup(g.id);
    r.append(b);
  });
  const a = document.createElement("button");
  a.className = "grp add";
  a.textContent = "+";
  a.title = "Create or join a group";
  a.setAttribute("aria-label", "Create or join a group");
  a.onclick = () => openG("create");
  r.append(a);
}
function drawChans() {
  const w = $("chs");
  w.textContent = "";
  channels.forEach((c) => {
    const b = document.createElement("button");
    b.className = "ch";
    b.textContent = "# " + c.name;
    b.setAttribute("aria-current", c.id === cid);
    b.onclick = () => {
      openChannel(c.id);
      document.body.classList.remove("show-left");
    };
    w.append(b);
  });
  if (myRole === "admin" && gid) {
    const n = document.createElement("button");
    n.className = "ch";
    n.textContent = "+ New channel";
    n.onclick = async () => {
      const raw = prompt("New channel name (letters, numbers, dashes):");
      if (!raw) return;
      const name = raw.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30);
      if (!name) return toast("Use letters, numbers, or dashes.");
      const { data, error } = await supabase.from("channels").insert({ group_id: gid, name }).select("id,name").single();
      if (error) return toast("Could not create that channel.");
      channels.push(data);
      openChannel(data.id);
    };
    w.append(n);
    const rb = document.createElement("button");
    rb.className = "ch";
    rb.textContent = "Reports";
    rb.onclick = openReports;
    w.append(rb);
    const ib = document.createElement("button");
    ib.className = "ch";
    ib.textContent = "New invite code";
    ib.onclick = async () => {
      if (!confirm("Make a new invite code? The old code will stop working.")) return;
      const { data, error } = await supabase.rpc("regenerate_invite", { p_group: gid });
      if (error) return toast("Could not change the code.");
      const g = groups.find((x) => x.id === gid);
      if (g) g.invite_code = data;
      $("gcode").textContent = data;
      toast("New invite code ready.");
    };
    w.append(ib);
  }
  if (gid) {
    const lb = document.createElement("button");
    lb.className = "ch";
    lb.textContent = "Leave group";
    lb.onclick = async () => {
      if (!confirm("Leave this group?")) return;
      const { error } = await supabase.rpc("leave_group", { p_group: gid });
      if (error) return toast(error.message.includes("Only admin") ? "You are the only admin, so you cannot leave yet." : "Could not leave the group.");
      await loadGroups();
      toast("You left the group.");
    };
    w.append(lb);
  }
}
function drawMembers(members) {
  const l = $("memlist");
  l.textContent = "";
  members
    .map((m) => ({ m, p: prof[m.user_id] || { username: "Unknown", color: COL[0] } }))
    .sort((a, b) => (a.m.role === "admin" ? 0 : 1) - (b.m.role === "admin" ? 0 : 1) || a.p.username.localeCompare(b.p.username))
    .forEach(({ m, p }) => {
      const d = document.createElement("div");
            d.dataset.user = m.user_id;
      d.append(av(p), p.username);
      if (m.role === "admin") {
        const s = document.createElement("small");
        s.textContent = "admin";
        d.append(s);
      }
      if (me && m.user_id !== me.id) {
        const acts = document.createElement("div");
        acts.className = "mact";
        const isB = blocked.has(m.user_id);
        const bl = document.createElement("button");
        bl.className = "mb";
        bl.textContent = isB ? "Unblock" : "Block";
        bl.onclick = () => (isB ? unblockUser(m.user_id) : blockUser(m.user_id));
        acts.append(bl);
        if (myRole === "admin" && m.role !== "admin") {
          const rm = document.createElement("button");
          rm.className = "mb";
          rm.textContent = "Remove";
          rm.onclick = () => {
            if (confirm("Remove " + p.username + " from this group?")) modMember(m.user_id, false, false);
          };
          const bn = document.createElement("button");
          bn.className = "mb";
          bn.textContent = "Ban";
          bn.onclick = () => {
            if (!confirm("Ban " + p.username + "? They will not be able to rejoin with the invite code.")) return;
            modMember(m.user_id, true, confirm("Also delete all of their messages in this group?"));
          };
          acts.append(rm, bn);
        }
        d.append(acts);
      }
      l.append(d);
    });
}
function drawEmpty() {
  drawRail();
  $("gname").textContent = "Rally";
  document.querySelector(".side .code").hidden = true;
  $("chs").textContent = "";
  $("memlist").textContent = "";
  $("cname").textContent = "";
  const w = $("msgs");
  w.textContent = "";
  const e = document.createElement("div");
  e.className = "empty";
  const h = document.createElement("h2");
  h.textContent = "Welcome to Rally";
  const p = document.createElement("p");
  p.textContent = "Create a group for your friends, or join one with an invite code.";
  const b1 = document.createElement("button");
  b1.textContent = "Create a group";
  b1.onclick = () => openG("create");
  const b2 = document.createElement("button");
  b2.textContent = "Join with a code";
  b2.onclick = () => openG("join");
  e.append(h, p, b1, b2);
  w.append(e);
}

function removeMsg(id) {
  const el = $("msgs").querySelector('[data-id="' + String(id) + '"]');
  if (el) el.remove();
  shown.delete(String(id));
}
function setText(pe, content, edited) {
  pe.dataset.raw = content;
  pe.textContent = content;
  if (edited) {
    const s = document.createElement("span");
    s.className = "ed";
    s.textContent = " (edited)";
    pe.append(s);
  }
}
function applyEdit(m) {
  const el = $("msgs").querySelector('[data-id="' + String(m.id) + '"]');
  if (!el) return;
  setText(el.querySelector(".mt"), m.content, !!m.edited_at);
}
function startEdit(el, pe, id) {
  if (el.querySelector(".editbox")) return;
  const box = document.createElement("div");
  box.className = "editbox";
  const input = document.createElement("input");
  input.value = pe.dataset.raw;
  input.maxLength = 2000;
  input.setAttribute("aria-label", "Edit message");
  const save = document.createElement("button");
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  const close = () => { box.remove(); pe.hidden = false; };
  const commit = async () => {
    const t = input.value.trim();
    if (!t) return toast("A message cannot be empty.");
    if (t === pe.dataset.raw) return close();
    save.disabled = true;
    const { data, error } = await supabase.from("messages").update({ content: t }).eq("id", id).select("id,content,edited_at");
    if (error || !data || !data.length) { save.disabled = false; return toast("Could not edit that message."); }
    applyEdit(data[0]);
    close();
  };
  save.onclick = commit;
  cancel.onclick = close;
  input.onkeydown = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") close();
  };
  pe.hidden = true;
  pe.after(box);
  box.append(input, save, cancel);
  input.focus();
}
function msgEl(m, p) {
  const mine = m.user_id === me.id;
  const el = document.createElement("div");
  el.className = "m" + (mine ? " mine" : "");
  el.dataset.id = String(m.id);
  el.dataset.user = m.user_id;
    el.dataset.reply = m.reply_to || "";
  const b = document.createElement("div");
  b.className = "b";
  const h = document.createElement("div");
  const nm = document.createElement("span");
  nm.className = "n";
  nm.textContent = p.username;
  const tm = document.createElement("span");
  tm.className = "t";
  tm.textContent = fmt(m.created_at);
  h.append(nm, tm);
  const pe = document.createElement("p");
  pe.className = "mt";
  setText(pe, m.content, !!m.edited_at);
  const a = document.createElement("div");
  a.className = "act";
  const acts = [
    ["React", () => toast("Reactions come in Phase 6")],
    ["Reply", () => { $("inp").focus(); $("inp").placeholder = "Replying to " + p.username; }],
  ];
  if (!mine) acts.push(["Report", () => openReport(p.username, m.content, m.id, m.user_id)]);
  for (const [l, f] of acts) {
    const x = document.createElement("button");
    x.textContent = l;
    x.onclick = f;
    a.append(x);
  }
  if (mine) {
    const ed = document.createElement("button");
    ed.textContent = "Edit";
    ed.onclick = () => startEdit(el, pe, m.id);
    a.append(ed);
  }
  if (mine || myRole === "admin") {
    const d = document.createElement("button");
    d.className = "del";
    d.textContent = "Delete";
    d.onclick = async () => {
      if (!d.classList.contains("sure")) {
        d.classList.add("sure");
        d.textContent = "Confirm?";
        setTimeout(() => { d.classList.remove("sure"); d.textContent = "Delete"; }, 3000);
        return;
      }
      const { data, error } = await supabase.from("messages").delete().eq("id", m.id).select("id");
      if (error || !data || !data.length) return toast("Could not delete that message.");
      removeMsg(m.id);
    };
    a.append(d);
  }
  b.append(h, pe, a);
  el.append(av(p), b);
  return el;
}
async function addMsg(m, scroll) {
  const key = String(m.id);
  if (!me || shown.has(key) || blocked.has(m.user_id) || (m.channel_id && m.channel_id !== cid)) return;
  shown.add(key);
  const p = await who(m.user_id);
  const w = $("msgs");
  const near = w.scrollHeight - w.scrollTop - w.clientHeight < 120;
  w.append(msgEl(m, p));
  if (scroll && (near || m.user_id === me.id)) w.scrollTop = w.scrollHeight;
}

async function loadBlocks() {
  const { data } = await supabase.from("blocks").select("blocked_id");
  blocked = new Set((data || []).map((x) => x.blocked_id));
}
async function init() {
  await loadBlocks();
  await loadGroups();
}
async function blockUser(uid) {
  const { error } = await supabase.from("blocks").insert({ blocker_id: me.id, blocked_id: uid });
  if (error && error.code !== "23505") return toast("Could not block that person.");
  blocked.add(uid);
  $("msgs").querySelectorAll('[data-user="' + uid + '"]').forEach((e) => e.remove());
  drawMembers(curMembers);
  toast("Blocked. You will not see their messages.");
}
async function unblockUser(uid) {
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", me.id).eq("blocked_id", uid);
  if (error) return toast("Could not unblock.");
  blocked.delete(uid);
  drawMembers(curMembers);
  openChannel(cid);
  toast("Unblocked.");
}
async function modMember(uid, ban, wipe) {
  const { error } = await supabase.rpc("remove_member", { p_group: gid, p_user: uid, p_ban: ban, p_wipe: wipe });
  if (error) return toast("Could not do that.");
  await openGroup(gid);
  toast(ban ? "Member banned." : "Member removed.");
}
async function openReports() {
  $("repov").classList.add("on");
  const list = $("replist");
  list.textContent = "Loading...";
  const { data, error } = await supabase
    .from("reports")
    .select("id,reason,description,message_text,reported_user,created_at")
    .eq("group_id", gid)
    .eq("status", "open")
    .order("created_at");
  list.textContent = "";
  if (error) { list.textContent = "Could not load reports."; return; }
  if (!data.length) { list.textContent = "No open reports. All quiet."; return; }
  for (const r of data) {
    const p = await who(r.reported_user);
    const item = document.createElement("div");
    item.className = "rep-item";
    const t = document.createElement("b");
    t.textContent = p.username + " - " + r.reason;
    const q = document.createElement("div");
    q.textContent = "Message: " + r.message_text;
    const d = document.createElement("div");
    d.textContent = "Why: " + r.description;
    const acts = document.createElement("div");
    acts.className = "acts";
    const btns = [["Dismiss", "dismiss"], ["Delete message", "delete_message"], ["Remove member", "remove_member"], ["Ban", "ban_member"]];
    for (const [label, act] of btns) {
      const b = document.createElement("button");
      b.textContent = label;
      b.onclick = async () => {
        if (act !== "dismiss" && !confirm(label + "?")) return;
        const { error: e2 } = await supabase.rpc("resolve_report", { rid: r.id, act });
        if (e2) return toast(e2.message.toLowerCase().includes("admin") ? "You cannot do that to an admin." : "Could not do that.");
        item.remove();
        if (act !== "dismiss") openGroup(gid);
        toast("Done.");
      };
      acts.append(b);
    }
    item.append(t, q, d, acts);
    list.append(item);
  }
}
async function loadGroups(select) {
  const { data, error } = await supabase.from("groups").select("id,name,invite_code").order("created_at");
  if (error) return toast("Could not load groups.");
  groups = data || [];
  if (select) gid = select;
  else if (!groups.some((g) => g.id === gid)) gid = groups[0] ? groups[0].id : null;
  await openGroup(gid);
}
async function openGroup(id) {
  gid = id;
  const g = groups.find((x) => x.id === id);
  if (!g) {
    channels = [];
    cid = null;
    if (live) { supabase.removeChannel(live); live = null; }
    return drawEmpty();
  }
  drawRail();
  $("gname").textContent = g.name;
  $("gcode").textContent = g.invite_code;
  document.querySelector(".side .code").hidden = false;
  const [ch, mm] = await Promise.all([
    supabase.from("channels").select("id,name").eq("group_id", id).order("created_at"),
    supabase.from("group_members").select("user_id,role").eq("group_id", id),
  ]);
  channels = ch.data || [];
  const members = mm.data || [];
  const mineRow = members.find((m) => m.user_id === me.id);
  myRole = mineRow ? mineRow.role : "member";
  const { data: ps } = await supabase.from("profiles").select("id,username,color").in("id", members.map((m) => m.user_id));
  (ps || []).forEach((p) => (prof[p.id] = p));
  curMembers = members;
  drawMembers(members);
  if (!channels.some((c) => c.id === cid)) cid = channels[0] ? channels[0].id : null;
  await openChannel(cid);
}
let openToken = 0;
async function openChannel(id) {
  const token = ++openToken;
  cid = id;
  drawChans();
  if (live) { supabase.removeChannel(live); live = null; }
  const ch = channels.find((c) => c.id === id);
  $("cname").textContent = ch ? "# " + ch.name : "";
  $("inp").placeholder = ch ? "Message #" + ch.name : "Message";
  const w = $("msgs");
  w.textContent = "";
  shown.clear();
  if (!ch) return;
  const { data, error } = await supabase
    .from("messages")
    .select("id,channel_id,user_id,content,created_at,edited_at,reply_to")
    .eq("channel_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (token !== openToken) return;
  if (error) return toast("Could not load messages.");
  for (const m of (data || []).reverse()) {
    if (token !== openToken) return;
    await addMsg(m, false);
  }
  w.scrollTop = w.scrollHeight;
  if (token !== openToken) return;
  live = supabase
    .channel("room-" + id + "-" + token)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "channel_id=eq." + id }, (p) => addMsg(p.new, true))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: "channel_id=eq." + id }, (p) => applyEdit(p.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => removeMsg(p.old.id))
    .subscribe();
}

async function send() {
  const v = $("inp");
  const t = v.value.trim();
  if (!t || !cid || !me || sending) return;
  sending = true;
  v.value = "";
  const { data, error } = await supabase
    .from("messages")
        .insert({ channel_id: cid, user_id: me.id, content: t, reply_to: (window.rallyReply && window.rallyReply.id) || null })
    .select("id,channel_id,user_id,content,created_at,edited_at,reply_to")
    .single();
  sending = false;
  const ch = channels.find((c) => c.id === cid);
  v.placeholder = ch ? "Message #" + ch.name : "Message";
  if (error) { v.value = t; return toast(error.message.includes("Slow down") ? "You are sending messages too fast. Wait a moment." : "Message not sent. Try again."); }
    addMsg(data, true);
  document.dispatchEvent(new Event("rally-reply-sent"));
}

let gmode = "create";
function gMsg(t) { $("gmsg").textContent = t; }
function gMode(m) {
  gmode = m;
  $("gt-create").classList.toggle("on", m === "create");
  $("gt-join").classList.toggle("on", m === "join");
  $("glabel").textContent = m === "create" ? "Group name" : "Invite code";
  $("gin").placeholder = m === "create" ? "For example: Homeroom" : "For example: A3F9-0B2C";
  $("ggo").textContent = m === "create" ? "Create group" : "Join group";
  $("gin").value = "";
  gMsg("");
}
function openG(m) { gMode(m || "create"); $("gov").classList.add("on"); $("gin").focus(); }
function closeG() { $("gov").classList.remove("on"); }
async function submitG() {
  const v = $("gin").value.trim();
  if (!v) return gMsg(gmode === "create" ? "Enter a group name." : "Enter an invite code.");
  if (gmode === "create" && v.length < 2) return gMsg("Group names need at least 2 characters.");
  $("ggo").disabled = true;
  gMsg("");
  const { data, error } = gmode === "create"
    ? await supabase.rpc("create_group", { group_name: v })
    : await supabase.rpc("join_group", { code: v });
  $("ggo").disabled = false;
  if (error) return gMsg(error.message.includes("Invalid invite") ? "That invite code does not match any group." : error.message.includes("banned") ? "You are banned from that group." : "Something went wrong. Try again.");
  closeG();
  await loadGroups(data);
}
$("gt-create").onclick = () => gMode("create");
$("gt-join").onclick = () => gMode("join");
$("gcancel").onclick = closeG;
$("ggo").onclick = submitG;
$("gin").onkeydown = (e) => { if (e.key === "Enter") submitG(); };
$("gov").onclick = (e) => { if (e.target === $("gov")) closeG(); };

const REASONS = ["Harassment or bullying", "Hate or discrimination", "Threats or violence", "Sexual content", "Spam or scams", "Something else"];
let rep = null;
REASONS.forEach((r) => {
  const l = document.createElement("label");
  l.className = "opt";
  const i = document.createElement("input");
  i.type = "radio";
  i.name = "reason";
  i.value = r;
  i.onchange = chk;
  l.append(i, r);
  $("rreasons").append(l);
});
function chk() {
  const r = document.querySelector("input[name=reason]:checked");
  const n = $("rdesc").value.trim().length;
  $("rhint").textContent = n < 20
    ? "Add at least " + (20 - n) + " more characters so admins can review this fairly."
    : "Admins will read this alongside the message. Reports with no real violation are dismissed, and repeated false reports can lead to a warning.";
  $("rgo").disabled = !(r && n >= 20);
}
function openReport(n, t, id, uid) {
  rep = { n, t, id, uid };
  $("rwho").textContent = n + " wrote:";
  $("rtxt").textContent = t;
  $("rdesc").value = "";
  $("rblock").checked = false;
  document.querySelectorAll("input[name=reason]").forEach((x) => (x.checked = false));
  chk();
  $("ov").classList.add("on");
  $("rreasons").querySelector("input").focus();
}
function closeReport() { $("ov").classList.remove("on"); }
$("rdesc").oninput = chk;
$("rcancel").onclick = closeReport;
$("ov").onclick = (e) => { if (e.target === $("ov")) closeReport(); };
$("rgo").onclick = async () => {
  const r = document.querySelector("input[name=reason]:checked");
  const b = $("rblock").checked;
  $("rgo").disabled = true;
  const { error } = await supabase.rpc("report_message", { msg_id: rep.id, p_reason: r.value, p_description: $("rdesc").value.trim() });
  if (error) {
    $("rgo").disabled = false;
    return toast(error.message.includes("Already") ? "You already reported that message." : error.message.includes("Too many") ? "You have sent too many reports. Try again later." : "Could not send the report.");
  }
  closeReport();
  if (b) await blockUser(rep.uid);
  toast("Report sent to the group admins.");
};
$("repclose").onclick = () => $("repov").classList.remove("on");
$("repov").onclick = (e) => { if (e.target === $("repov")) $("repov").classList.remove("on"); };
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeReport(); closeG(); $("repov").classList.remove("on"); }
});

$("gcode").title = "Click to copy";
$("gcode").style.cursor = "pointer";
$("gcode").onclick = () => navigator.clipboard.writeText($("gcode").textContent).then(() => toast("Invite code copied"), () => toast("Could not copy"));
$("send").onclick = send;
$("inp").maxLength = 2000;
$("inp").onkeydown = (e) => { if (e.key === "Enter") send(); };
$("navbtn").onclick = () => document.body.classList.toggle("show-left");
$("membtn").onclick = () => document.body.classList.toggle("show-mem");
$("scrim").onclick = () => document.body.classList.remove("show-left", "show-mem");
$("theme").onclick = () => {
  const r = document.documentElement;
  const l = r.dataset.theme === "light";
  r.dataset.theme = l ? "dark" : "light";
  $("theme").textContent = l ? "Light mode" : "Dark mode";
};

function resetAll() {
  me = null;
  groups = [];
  channels = [];
  gid = null;
  cid = null;
  curMembers = [];
  blocked = new Set();
  if (live) { supabase.removeChannel(live); live = null; }
  drawEmpty();
}
supabase.auth.onAuthStateChange((_event, session) => {
  const u = session && session.user;
  setTimeout(() => {
    if (u) {
      if (!me || me.id !== u.id) { me = u; init(); }
    } else if (me) {
      resetAll();
    }
  }, 0);
});
supabase.auth.getSession().then(({ data }) => {
  const u = data.session && data.session.user;
  if (u && !me) { me = u; init(); }
});
drawEmpty();
window.rally = {
  get gid() { return gid; },
  get cid() { return cid; },
  get role() { return myRole; },
  get uid() { return me ? me.id : null; },
  refresh: () => openGroup(gid),
};
  reload: (sel) => loadGroups(sel)