import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

let rank = "none", tab = "events", renderToken = 0, birthToken = 0, myLock = false;
let study = null, studyBy = null, studyByName = "";
const notified = new Set();

const isAdmin = () => R().role === "admin" || rank !== "none";
const pad = (n) => String(n).padStart(2, "0");
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return pad(Math.floor(s / 60)) + ":" + pad(s % 60);
};

const css = document.createElement("style");
css.textContent = `
#rc-btn{display:block;width:calc(100% - 16px);margin:6px 8px;text-align:left;padding:9px 12px;border-radius:10px;background:var(--raised);color:var(--text);font-weight:600}
#rc-chip{padding:6px 12px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-weight:700;margin-right:6px}
#rc-chip[hidden]{display:none}
.rc-dlg{max-width:560px;width:100%;max-height:92%;overflow-y:auto}
.rc-tabs{display:flex;gap:6px;flex-wrap:wrap;background:var(--raised);padding:4px;border-radius:12px;margin:10px 0 14px}
.rc-tabs button{flex:1;padding:8px;border-radius:9px;color:var(--muted);font-weight:600;white-space:nowrap}
.rc-tabs button.on{background:var(--accent);color:var(--on-accent)}
.rc-in{display:block;width:100%;margin:6px 0;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
.rc-act{padding:8px 14px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-weight:700;margin:4px 6px 4px 0}
.rc-act.sec{background:var(--raised);color:var(--text)}
.rc-act:disabled{opacity:.5}
.rc-msg{min-height:20px;font-size:14px;margin:6px 0}
.rc-sec{font-weight:700;font-size:12px;letter-spacing:.06em;color:var(--muted);margin:16px 0 4px;text-transform:uppercase}
.rc-item{background:var(--raised);border-left:3px solid var(--accent);border-radius:8px;padding:10px;margin-bottom:8px;overflow-wrap:anywhere}
.rc-when{color:var(--muted);font-size:13px}
.rc-note{margin:4px 0;color:var(--muted);font-size:14px}
.rc-big{font:800 44px var(--head);text-align:center;margin:10px 0}
.rc-check{display:flex;gap:8px;align-items:center;margin:8px 0}
.rc-warn{background:var(--raised);border-left:3px solid var(--pink);border-radius:8px;padding:10px;margin:0 0 10px}
.rc-rules{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--raised);border-radius:10px;padding:12px;margin:10px 0;max-height:45vh;overflow-y:auto}
.rc-bday{display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--raised);border-left:3px solid var(--pink);border-bottom:1px solid var(--line)}
.rc-bday[hidden]{display:none}
.rc-bday-text{flex:1;min-width:0;font-size:14px;overflow-wrap:anywhere}
.rc-x{flex:none;padding:2px 8px;border-radius:8px;color:var(--muted)}
.rc-x:hover{background:var(--panel);color:var(--text)}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="rc-ov"><div class="dlg rc-dlg" role="dialog" aria-modal="true" aria-labelledby="rc-title">
  <h2 id="rc-title">Server tools</h2>
  <div class="rc-tabs" id="rc-tabs"></div>
  <div id="rc-body"></div>
  <div class="row"><button class="cancel" id="rc-close">Close</button></div>
</div></div>
<div class="ov" id="rc-rules-ov" style="z-index:70"><div class="dlg rc-dlg" role="dialog" aria-modal="true" aria-labelledby="rc-rt">
  <h2 id="rc-rt">Server rules</h2>
  <p class="sub" id="rc-rsub"></p>
  <div class="rc-rules" id="rc-rtxt"></div>
  <div class="row"><button class="cancel" id="rc-leave">Leave server</button><button class="go amber" id="rc-agree">I agree</button></div>
</div></div>`);

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2800);
}
function say(el, t, ok) {
  el.textContent = t;
  el.style.color = ok ? "var(--accent)" : "var(--pink)";
}

// ---------- Rally-wide rank ----------
async function checkRank() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { rank = "none"; return; }
  const { data: r } = await supabase.rpc("my_rank");
  rank = r === "owner" || r === "admin" ? r : "none";
  checkRules();
}
supabase.auth.onAuthStateChange(() => { setTimeout(checkRank, 0); });
checkRank();

// ---------- Buttons and banners ----------
const hubBtn = h("button", "", "🛠️ Server tools");
hubBtn.id = "rc-btn";
const meRow = document.querySelector(".side .me");
if (meRow) meRow.before(hubBtn); else document.querySelector(".side").append(hubBtn);

const chip = h("button", "");
chip.id = "rc-chip";
chip.hidden = true;
chip.title = "Study timer";
$("membtn").before(chip);

const bday = h("div", "rc-bday");
bday.hidden = true;
const bdayText = h("div", "rc-bday-text");
const bdayX = h("button", "rc-x", "✕");
bdayX.setAttribute("aria-label", "Hide this");
bday.append(bdayText, bdayX);
$("msgs").before(bday);

// ================= HUB =================
function openHub(t) {
  if (t) tab = t;
  $("rc-ov").classList.add("on");
  render();
}
function closeHub() { $("rc-ov").classList.remove("on"); }
hubBtn.onclick = () => openHub();
chip.onclick = () => openHub("study");
$("rc-close").onclick = closeHub;
$("rc-ov").onclick = (e) => { if (e.target === $("rc-ov")) closeHub(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeHub(); });

function render() {
  const token = ++renderToken;
  const tabs = $("rc-tabs");
  tabs.textContent = "";
  [["events", "📅 Events"], ["study", "⏱️ Study"], ["bday", "🎂 Birthday"], ["rules", "📜 Rules"]].forEach(([k, label]) => {
    const b = h("button", k === tab ? "on" : "", label);
    b.type = "button";
    b.onclick = () => { tab = k; render(); };
    tabs.append(b);
  });
  const box = $("rc-body");
  box.textContent = "";
  if (tab === "events") renderEvents(box, token);
  else if (tab === "study") renderStudy(box, token);
  else if (tab === "bday") renderBday(box, token);
  else renderRules(box, token);
}

// ---------- Events ----------
function renderEvents(box, token) {
  const gid = R().gid;
  if (!gid) return box.append(h("p", "sub", "Open a server first."));
  box.append(h("p", "sub", "Upcoming events for this server."));
  const list = h("div");
  box.append(list);
  if (isAdmin()) {
    box.append(h("div", "rc-sec", "Add an event"));
    const t = h("input", "rc-in");
    t.maxLength = 100;
    t.placeholder = "Title (for example: Math test)";
    const d = h("input", "rc-in");
    d.type = "datetime-local";
    const n = h("input", "rc-in");
    n.maxLength = 300;
    n.placeholder = "Notes (optional)";
    const msg = h("p", "rc-msg");
    const go = h("button", "rc-act", "Add event");
    go.onclick = async () => {
      if (!t.value.trim()) return say(msg, "Type a title.");
      if (!d.value) return say(msg, "Pick a date and time.");
      go.disabled = true;
      const { error } = await supabase.rpc("create_event", {
        p_group: gid, p_title: t.value.trim(), p_notes: n.value.trim(), p_starts: new Date(d.value).toISOString(),
      });
      go.disabled = false;
      if (error) {
        return say(msg, error.message.includes("Too many") ? "This server has too many events. Delete some first."
          : error.message.includes("Bad date") ? "Pick a date within the next year."
          : "Could not add that. Did you run the SQL?");
      }
      toast("Event added.");
      render();
    };
    box.append(t, d, n, go, msg);
  }
  list.append(h("p", "sub", "Loading..."));
  (async () => {
    const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("events")
      .select("id,title,notes,starts_at,created_by")
      .eq("group_id", gid)
      .gte("starts_at", since)
      .order("starts_at")
      .limit(60);
    if (token !== renderToken) return;
    list.textContent = "";
    if (error) return list.append(h("p", "sub", "Could not load events. Did you run the SQL?"));
    if (!data.length) return list.append(h("p", "sub", "No upcoming events yet."));
    data.forEach((e) => {
      const item = h("div", "rc-item");
      item.append(
        h("div", "rc-when", new Date(e.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })),
        h("b", "", e.title)
      );
      if (e.notes) item.append(h("p", "rc-note", e.notes));
      if (isAdmin() || e.created_by === R().uid) {
        const del = h("button", "rc-act sec", "Delete");
        del.onclick = async () => {
          if (!confirm("Delete this event?")) return;
          const { error: e2 } = await supabase.rpc("delete_event", { p_event: e.id });
          if (e2) return toast("Could not delete that.");
          render();
        };
        item.append(del);
      }
      list.append(item);
    });
  })();
}

// ---------- Study timer ----------
async function pollStudy() {
  const cid = R().cid;
  if (!cid) { study = null; paintChip(); return; }
  const { data } = await supabase.from("study_sessions").select("kind,ends_at,started_by").eq("channel_id", cid).maybeSingle();
  if (cid !== R().cid) return;
  if (data && new Date(data.ends_at).getTime() > Date.now()) {
    if (data.started_by !== studyBy) {
      studyBy = data.started_by;
      const { data: p } = await supabase.from("profiles").select("username").eq("id", data.started_by).maybeSingle();
      studyByName = (p && p.username) || "";
    }
    study = { cid, kind: data.kind, ends: new Date(data.ends_at).getTime() };
  } else {
    study = null;
    studyBy = null;
  }
  paintChip();
}
function paintChip() {
  if (study && study.cid !== R().cid) study = null;
  if (study && Date.now() >= study.ends) {
    if (!notified.has(study.ends)) {
      notified.add(study.ends);
      toast(study.kind === "focus" ? "⏱ Focus time is over. Take a break!" : "⏱ Break is over. Back to it!");
    }
    study = null;
  }
  if (!study) { chip.hidden = true; return; }
  chip.hidden = false;
  const left = clock(study.ends - Date.now());
  chip.textContent = (study.kind === "focus" ? "🍅 " : "☕ ") + left;
  const big = $("rc-timer");
  if (big) big.textContent = left;
}
setInterval(paintChip, 1000);

async function startStudy(kind, mins, msgEl) {
  if (!Number.isInteger(mins) || mins < 1 || mins > 120) return say(msgEl, "Pick 1 to 120 minutes.");
  const { error } = await supabase.rpc("start_study", { p_channel: R().cid, p_kind: kind, p_minutes: mins });
  if (error) {
    return say(msgEl, error.message.includes("already") ? "A timer is already running. Only its starter or an admin can replace it."
      : error.message.includes("banned") ? "Your account is banned."
      : "Could not start it. Did you run the SQL?");
  }
  await pollStudy();
  if (tab === "study") render();
}

async function renderStudy(box, token) {
  if (!R().cid) return box.append(h("p", "sub", "Open a channel first."));
  box.append(h("p", "sub", "Start a shared timer for this channel. Everyone in it sees the countdown in the top bar."));
  await pollStudy();
  if (token !== renderToken) return;
  if (study) {
    const big = h("div", "rc-big", clock(study.ends - Date.now()));
    big.id = "rc-timer";
    box.append(big, h("p", "sub", (study.kind === "focus" ? "🍅 Focus session" : "☕ Break") + (studyByName ? " started by " + studyByName : "")));
    if (studyBy === R().uid || isAdmin()) {
      const stop = h("button", "rc-act sec", "Stop timer");
      stop.onclick = async () => {
        const { error } = await supabase.rpc("stop_study", { p_channel: R().cid });
        if (error) return toast("Could not stop it.");
        study = null;
        studyBy = null;
        paintChip();
        render();
      };
      box.append(stop);
    }
  }
  box.append(h("div", "rc-sec", "Start a timer"));
  const msg = h("p", "rc-msg");
  [["focus", 25, "🍅 Focus 25 min"], ["break", 5, "☕ Break 5 min"], ["focus", 50, "📚 Focus 50 min"]].forEach(([kind, mins, label]) => {
    const b = h("button", "rc-act", label);
    b.onclick = () => startStudy(kind, mins, msg);
    box.append(b);
  });
  const cust = h("input", "rc-in");
  cust.type = "number";
  cust.min = "1";
  cust.max = "120";
  cust.placeholder = "Custom minutes (1 to 120)";
  const cb = h("button", "rc-act sec", "Start custom focus");
  cb.onclick = () => startStudy("focus", parseInt(cust.value, 10), msg);
  box.append(cust, cb, msg);
}

// ---------- Birthdays ----------
async function renderBday(box, token) {
  box.append(h("p", "sub", "Optional. Pick your birthday and Rally can show a shoutout to your servers on your day. Only the month and day are saved, never the year or your age. It stays off until you turn it on."));
  const uid = R().uid;
  if (!uid) return;
  const { data } = await supabase.from("birthdays").select("b_month,b_day,share").eq("user_id", uid).maybeSingle();
  if (token !== renderToken) return;
  const mon = h("select", "rc-in");
  MONTHS.forEach((m, i) => { const o = h("option", "", m); o.value = String(i + 1); mon.append(o); });
  const day = h("select", "rc-in");
  for (let i = 1; i <= 31; i++) { const o = h("option", "", String(i)); o.value = String(i); day.append(o); }
  if (data) { mon.value = String(data.b_month); day.value = String(data.b_day); }
  const lab = h("label", "rc-check");
  const cb = h("input");
  cb.type = "checkbox";
  cb.checked = !!(data && data.share);
  lab.append(cb, " Show a birthday shoutout in my servers");
  const msg = h("p", "rc-msg");
  const save = h("button", "rc-act", "Save");
  save.onclick = async () => {
    const { error } = await supabase.rpc("set_birthday", { p_month: Number(mon.value), p_day: Number(day.value), p_share: cb.checked });
    if (error) return say(msg, error.message.includes("Bad date") ? "That date does not exist." : "Could not save. Did you run the SQL?");
    say(msg, "Saved!", true);
  };
  const clear = h("button", "rc-act sec", "Remove my birthday");
  clear.onclick = async () => {
    const { error } = await supabase.rpc("clear_birthday");
    if (error) return say(msg, "Could not remove it.");
    say(msg, "Removed.", true);
    cb.checked = false;
  };
  box.append(mon, day, lab, save, clear, msg);
}

async function loadBirthdays() {
  const my = ++birthToken;
  const gid = R().gid;
  if (!gid || !R().uid) { bday.hidden = true; return; }
  const d = new Date();
  const key = "rally-bday:" + gid + ":" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  try { if (localStorage.getItem(key)) { bday.hidden = true; return; } } catch (e) { /* ignore */ }
  const { data, error } = await supabase.rpc("todays_birthdays", { p_group: gid, p_month: d.getMonth() + 1, p_day: d.getDate() });
  if (my !== birthToken || gid !== R().gid) return;
  if (error || !data || !data.length) { bday.hidden = true; return; }
  const names = data.map((x) => x.out_name).join(", ").replace(/, ([^,]*)$/, " and $1");
  bdayText.textContent = "🎂 Happy birthday, " + names + "! 🎉";
  bday.dataset.key = key;
  bday.hidden = false;
}
bdayX.onclick = () => {
  try { localStorage.setItem(bday.dataset.key, "1"); } catch (e) { /* ignore */ }
  bday.hidden = true;
};

// ---------- Rules, muting, approvals ----------
async function renderRules(box, token) {
  const gid = R().gid;
  if (!gid) return box.append(h("p", "sub", "Open a server first."));
  const { data, error } = await supabase.rpc("get_rules", { p_group: gid });
  if (token !== renderToken) return;
  if (error || !data || !data.length) return box.append(h("p", "sub", "Could not load the rules. Did you run the SQL?"));
  const r = data[0];
  if (r.out_muted && !isAdmin()) {
    box.append(h("p", "rc-warn", "You are muted in this server until an admin approves you. You can still read everything."));
  }
  if (!isAdmin()) return box.append(h("div", "rc-rules", r.out_rules || "This server has no rules set yet."));

  box.append(h("p", "sub", "Members must accept these rules before they can post. Changing the text makes everyone accept again. Admins are never asked."));
  const ta = h("textarea", "rc-in");
  ta.maxLength = 1500;
  ta.style.minHeight = "140px";
  ta.placeholder = "1. Be kind.\n2. No spam.\n3. Keep it school-appropriate.";
  ta.value = r.out_rules || "";
  const lab = h("label", "rc-check");
  const cb = h("input");
  cb.type = "checkbox";
  cb.checked = !!r.out_mute_new;
  lab.append(cb, " New members start muted until an admin approves them");
  const msg = h("p", "rc-msg");
  const save = h("button", "rc-act", "Save");
  save.onclick = async () => {
    save.disabled = true;
    const { error: e2 } = await supabase.rpc("set_rules", { p_group: gid, p_rules: ta.value, p_mute_new: cb.checked });
    save.disabled = false;
    if (e2) return say(msg, "Could not save. Did you run the SQL?");
    say(msg, "Saved!", true);
    checkRules();
  };
  box.append(ta, lab, save, msg);
  box.append(h("div", "rc-sec", "Muted members waiting for approval"));
  const ml = h("div");
  box.append(ml);
  loadMuted(ml, gid, token);
}

async function loadMuted(ml, gid, token) {
  ml.append(h("p", "sub", "Loading..."));
  const { data, error } = await supabase.rpc("list_muted", { p_group: gid });
  if (token !== renderToken) return;
  ml.textContent = "";
  if (error) return ml.append(h("p", "sub", "Could not load the list."));
  if (!data.length) return ml.append(h("p", "sub", "Nobody is waiting."));
  const ids = data.map((x) => x.out_user);
  const { data: ps } = await supabase.from("profiles").select("id,username").in("id", ids);
  const names = {};
  (ps || []).forEach((p) => (names[p.id] = p.username));
  data.forEach((x) => {
    const row = h("div", "rc-item");
    row.append(h("b", "", names[x.out_user] || "Unknown"));
    const ap = h("button", "rc-act", "Approve");
    ap.onclick = async () => {
      const { error: e2 } = await supabase.rpc("approve_member", { p_group: gid, p_user: x.out_user });
      if (e2) return toast("Could not approve.");
      toast("Approved.");
      render();
    };
    row.append(ap);
    ml.append(row);
  });
  const all = h("button", "rc-act sec", "Approve everyone");
  all.onclick = async () => {
    const { error: e2 } = await supabase.rpc("approve_member", { p_group: gid, p_user: null });
    if (e2) return toast("Could not approve.");
    toast("Everyone approved.");
    render();
  };
  ml.append(all);
}

// The screen new members must accept (no close button, no Escape)
function showRules(text) {
  $("rc-rsub").textContent = "Please read and accept the rules of " + $("gname").textContent + " to chat here.";
  $("rc-rtxt").textContent = text;
  $("rc-rules-ov").classList.add("on");
}
function hideRules() { $("rc-rules-ov").classList.remove("on"); }

function lockInput(reason) {
  const inp = $("inp"), send = $("send");
  if (reason) {
    myLock = true;
    inp.disabled = true;
    send.disabled = true;
    inp.placeholder = reason;
  } else if (myLock) {
    myLock = false;
    inp.disabled = false;
    send.disabled = false;
    inp.placeholder = "Message #" + $("cname").textContent.replace(/^#\s*/, "");
  }
}

async function checkRules() {
  const gid = R().gid;
  if (!gid || !R().uid) { hideRules(); lockInput(null); return; }
  const { data, error } = await supabase.rpc("get_rules", { p_group: gid });
  if (gid !== R().gid) return;
  if (error || !data || !data.length) { hideRules(); lockInput(null); return; }
  const r = data[0];
  const exempt = isAdmin();
  if (r.out_rules && !r.out_accepted && !exempt) showRules(r.out_rules); else hideRules();
  lockInput(r.out_muted && !exempt ? "You are muted until an admin approves you." : null);
}

$("rc-agree").onclick = async () => {
  const gid = R().gid;
  if (!gid) return;
  $("rc-agree").disabled = true;
  const { error } = await supabase.rpc("accept_rules", { p_group: gid });
  $("rc-agree").disabled = false;
  if (error) return toast("Could not save that. Try again.");
  hideRules();
  checkRules();
};
$("rc-leave").onclick = async () => {
  const gid = R().gid;
  if (!gid || !confirm("Leave this server?")) return;
  const { error } = await supabase.rpc("leave_group", { p_group: gid });
  if (error) return toast(error.message.includes("Only admin") ? "You are the only admin, so you cannot leave yet." : "Could not leave.");
  hideRules();
  if (R().reload) R().reload();
};

// ---------- Keep everything fresh ----------
new MutationObserver(() => { checkRules(); pollStudy(); loadBirthdays(); })
  .observe($("cname"), { childList: true, characterData: true, subtree: true });
setInterval(() => { if (!document.hidden) checkRules(); }, 30000);
setInterval(() => { if (!document.hidden) pollStudy(); }, 10000);
setInterval(() => { if (!document.hidden) loadBirthdays(); }, 300000);