import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};

let rank = "none";
let locked = false;
let scanTimer = null;
const polls = new Map();   // message id -> poll row, or null if the message is not a poll
const results = new Map(); // poll id -> { counts: [...], mine: option number or -1 }

const css = document.createElement("style");
css.textContent = `
#rx-pollbtn{padding:0 16px;border-radius:12px;background:var(--accent);color:var(--on-accent);font-weight:700}
#rx-opts input.tx{margin:6px 0}
#rx-add{margin:4px 0 8px;padding:6px 12px;border-radius:8px;background:var(--raised);color:var(--text);font-weight:600;font-size:13px}
#rx-status{min-height:20px;font-size:14px;color:var(--pink);margin:6px 0 0}
.rx-card{margin-top:8px;max-width:420px;display:flex;flex-direction:column;gap:6px}
.rx-opt{position:relative;overflow:hidden;display:flex;justify-content:space-between;gap:10px;width:100%;text-align:left;padding:9px 12px;border-radius:10px;background:var(--raised);color:var(--text);font-weight:600;border:2px solid transparent}
.rx-opt .rx-bar{position:absolute;top:0;bottom:0;left:0;background:var(--accent);opacity:.25;width:0;transition:width .3s}
.rx-opt span{position:relative;overflow-wrap:anywhere}
.rx-opt.mine{border-color:var(--accent)}
.rx-opt:disabled{cursor:default;opacity:.85}
.rx-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:13px}
.rx-foot button{padding:3px 10px;border-radius:8px;background:var(--raised);color:var(--text);font-weight:600;font-size:12px}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="rx-ov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="rx-title">
  <h2 id="rx-title">Create a poll</h2>
  <label class="lb" for="rx-q">Question</label>
  <input class="tx" id="rx-q" maxlength="200" placeholder="For example: Pizza or tacos?" autocomplete="off">
  <label class="lb">Options (2 to 6)</label>
  <div id="rx-opts"></div>
  <button type="button" id="rx-add">+ Add option</button>
  <p id="rx-status" role="status"></p>
  <div class="row"><button class="cancel" id="rx-cancel">Cancel</button><button class="go amber" id="rx-go">Post poll</button></div>
</div></div>`);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2800);
}

// ---------- Your Rally-wide rank ----------
async function checkRank() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { rank = "none"; return; }
  const { data: r } = await supabase.rpc("my_rank");
  rank = r === "owner" || r === "admin" ? r : "none";
  guard();
}
supabase.auth.onAuthStateChange(() => { setTimeout(checkRank, 0); });
checkRank();

// ---------- Locks the message box when timed out or read-only ----------
async function guard() {
  const inp = $("inp"), send = $("send");
  const cid = R().cid, gid = R().gid, uid = R().uid;
  let reason = null;
  if (cid && gid && uid) {
    const [ch, to] = await Promise.all([
      supabase.from("channels").select("read_only").eq("id", cid).maybeSingle(),
      supabase.from("group_timeouts").select("until").eq("group_id", gid).eq("user_id", uid).maybeSingle(),
    ]);
    if (cid !== R().cid) return;
    if (to.data && new Date(to.data.until) > new Date()) {
      reason = "You are timed out until " + new Date(to.data.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ".";
    } else if (ch.data && ch.data.read_only && R().role !== "admin" && rank === "none") {
      reason = "This channel is read-only.";
    }
  }
  if (reason) {
    locked = true;
    inp.disabled = true;
    send.disabled = true;
    inp.placeholder = reason;
  } else if (locked) {
    locked = false;
    inp.disabled = false;
    send.disabled = false;
    inp.placeholder = "Message #" + $("cname").textContent.replace(/^#\s*/, "");
  }
}
new MutationObserver(guard).observe($("cname"), { childList: true, characterData: true, subtree: true });
setInterval(() => { if (!document.hidden) guard(); }, 20000);

// ---------- Polls: creating ----------
async function createPoll(q, opts) {
  if (!R().cid) return "Open a channel first.";
  const { error } = await supabase.rpc("create_poll", { p_channel: R().cid, p_question: q, p_options: opts });
  if (!error) return null;
  const m = error.message;
  if (m.includes("timed out")) return "You are timed out.";
  if (m.includes("read-only")) return "This channel is read-only.";
  if (m.includes("banned")) return "Your account is banned.";
  if (m.includes("Slow down")) return "Slow down a little.";
  if (m.includes("2 to 6")) return "Polls need 2 to 6 options.";
  return "Could not post the poll. Did you run the SQL?";
}

const optInputs = () => [...$("rx-opts").querySelectorAll("input")];
function addOpt(v) {
  if (optInputs().length >= 6) return;
  const i = document.createElement("input");
  i.className = "tx";
  i.maxLength = 60;
  i.placeholder = "Option " + (optInputs().length + 1);
  i.value = v || "";
  i.setAttribute("aria-label", "Option " + (optInputs().length + 1));
  $("rx-opts").append(i);
  $("rx-add").hidden = optInputs().length >= 6;
}
function say(t) { $("rx-status").textContent = t; }
function openDlg(q, opts) {
  if (!R().cid) return toast("Open a channel first.");
  say("");
  $("rx-q").value = q || "";
  $("rx-opts").textContent = "";
  $("rx-add").hidden = false;
  const list = opts && opts.length ? opts : ["", ""];
  list.slice(0, 6).forEach(addOpt);
  $("rx-ov").classList.add("on");
  $("rx-q").focus();
}
function closeDlg() { $("rx-ov").classList.remove("on"); }

const pollBtn = document.createElement("button");
pollBtn.id = "rx-pollbtn";
pollBtn.textContent = "📊";
pollBtn.title = "Create a poll";
pollBtn.setAttribute("aria-label", "Create a poll");
$("send").before(pollBtn);

pollBtn.onclick = () => openDlg();
$("rx-add").onclick = () => addOpt("");
$("rx-cancel").onclick = closeDlg;
$("rx-ov").onclick = (e) => { if (e.target === $("rx-ov")) closeDlg(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDlg(); });
$("rx-go").onclick = async () => {
  const q = $("rx-q").value.trim();
  const opts = optInputs().map((i) => i.value.trim()).filter(Boolean);
  if (!q) return say("Type a question.");
  if (opts.length < 2) return say("Add at least 2 options.");
  $("rx-go").disabled = true;
  const err = await createPoll(q, opts);
  $("rx-go").disabled = false;
  if (err) return say(err);
  closeDlg();
  toast("Poll posted.");
};

// ---------- Polls: showing and voting ----------
const looksLikePoll = (el) => {
  const mt = el.querySelector(".mt");
  return !!mt && (mt.dataset.raw || "").startsWith("📊 ");
};
const canManage = (poll) => poll.created_by === R().uid || R().role === "admin" || rank !== "none";

async function vote(poll, choice) {
  const { error } = await supabase.rpc("vote_poll", { p_poll: poll.id, p_option: choice });
  if (error) return toast(error.message.includes("closed") ? "That poll is closed." : "Could not vote.");
  refresh();
}
async function setClosed(poll, closed) {
  const { error } = await supabase.rpc("close_poll", { p_poll: poll.id, p_closed: closed });
  if (error) return toast("Only the poll's creator or an admin can do that.");
  refresh();
}

function draw(el) {
  const poll = polls.get(el.dataset.id);
  if (!poll) return;
  const b = el.querySelector(".b");
  if (!b) return;
  const res = results.get(poll.id) || { counts: poll.options.map(() => 0), mine: -1 };
  const sig = JSON.stringify([poll.closed, poll.options, res.counts, res.mine, canManage(poll)]);
  let card = b.querySelector(".rx-card");
  if (card && card.dataset.sig === sig) return;
  if (!card) {
    card = document.createElement("div");
    card.className = "rx-card";
    const act = b.querySelector(".act");
    if (act) act.before(card); else b.append(card);
  }
  card.dataset.sig = sig;
  card.textContent = "";
  const total = res.counts.reduce((a, c) => a + c, 0);
  poll.options.forEach((label, i) => {
    const pct = total ? Math.round((res.counts[i] * 100) / total) : 0;
    const btn = document.createElement("button");
    btn.className = "rx-opt" + (res.mine === i ? " mine" : "");
    btn.disabled = !!poll.closed;
    const bar = document.createElement("div");
    bar.className = "rx-bar";
    bar.style.width = pct + "%";
    const l = document.createElement("span");
    l.textContent = label;
    const n = document.createElement("span");
    n.textContent = res.counts[i] + (total ? " · " + pct + "%" : "");
    btn.append(bar, l, n);
    btn.onclick = () => vote(poll, res.mine === i ? -1 : i);
    card.append(btn);
  });
  const foot = document.createElement("div");
  foot.className = "rx-foot";
  const info = document.createElement("span");
  info.textContent = total + (total === 1 ? " vote" : " votes") + (poll.closed ? " · Closed" : "");
  foot.append(info);
  if (canManage(poll)) {
    const cb = document.createElement("button");
    cb.textContent = poll.closed ? "Reopen poll" : "Close poll";
    cb.onclick = () => setClosed(poll, !poll.closed);
    foot.append(cb);
  }
  card.append(foot);
}

async function refresh() {
  const cid = R().cid;
  const els = [...$("msgs").querySelectorAll(".m[data-id]")].filter(looksLikePoll);
  const ids = els.map((e) => e.dataset.id);
  if (!ids.length) return;
  const { data: rows } = await supabase
    .from("polls")
    .select("id,message_id,question,options,closed,created_by")
    .in("message_id", ids);
  if (cid !== R().cid) return;
  const byMsg = new Map((rows || []).map((r) => [String(r.message_id), r]));
  ids.forEach((id) => polls.set(id, byMsg.get(id) || null));
  const pids = (rows || []).map((r) => r.id);
  if (pids.length) {
    const { data: res } = await supabase.rpc("poll_results", { p_polls: pids });
    if (cid !== R().cid) return;
    const fresh = new Map();
    (rows || []).forEach((r) => fresh.set(r.id, { counts: r.options.map(() => 0), mine: -1 }));
    (res || []).forEach((x) => {
      const f = fresh.get(x.out_poll);
      if (!f) return;
      f.counts[x.out_idx] = Number(x.out_votes);
      if (x.out_mine) f.mine = x.out_idx;
    });
    fresh.forEach((v, k) => results.set(k, v));
  }
  els.forEach(draw);
}

function scan() {
  const els = [...$("msgs").querySelectorAll(".m[data-id]")].filter(looksLikePoll);
  let need = false;
  els.forEach((el) => {
    const id = el.dataset.id;
    if (polls.get(id) === null) return;               // a normal message that starts with the emoji
    if (!polls.has(id) || !el.querySelector(".rx-card")) need = true;
  });
  if (need) refresh();
}
new MutationObserver(() => {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 150);
}).observe($("msgs"), { childList: true, subtree: true });
setInterval(() => { if (!document.hidden) refresh(); }, 6000);

// ---------- Slash commands ----------
const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

// Returns true if the command was fully handled here (nothing else should send)
function handleCommand() {
  const inp = $("inp");
  const raw = inp.value.trim();
  if (!raw.startsWith("/")) return false;
  const sp = raw.indexOf(" ");
  const cmd = (sp < 0 ? raw : raw.slice(0, sp)).toLowerCase();
  const rest = sp < 0 ? "" : raw.slice(sp + 1).trim();

  // These three just change the text, then Rally sends it as a normal message
  if (cmd === "/shrug") { inp.value = (rest ? rest + " " : "") + "¯\\_(ツ)_/¯"; return false; }
  if (cmd === "/coinflip") { inp.value = "🪙 Coin flip: " + (rand(2) ? "Heads" : "Tails"); return false; }
  if (cmd === "/roll") {
    const sides = rest ? parseInt(rest, 10) : 6;
    if (Number.isNaN(sides) || sides < 2 || sides > 1000) { toast("Try /roll or /roll 20 (2 to 1000)."); return true; }
    inp.value = "🎲 Rolled a " + (rand(sides) + 1) + " (1-" + sides + ")";
    return false;
  }

  if (cmd === "/help") {
    inp.value = "";
    toast("Commands: /poll /roll /coinflip /shrug /readonly on|off");
    return true;
  }
  if (cmd === "/poll") {
    inp.value = "";
    const parts = rest.split("|").map((x) => x.trim());
    const q = parts[0] || "";
    const opts = parts.slice(1).filter(Boolean);
    if (!q || opts.length < 2) { openDlg(q, opts); return true; }
    createPoll(q, opts).then((err) => toast(err || "Poll posted."));
    return true;
  }
  if (cmd === "/readonly") {
    inp.value = "";
    const on = rest.toLowerCase();
    if (on !== "on" && on !== "off") { toast("Type /readonly on or /readonly off"); return true; }
    supabase.rpc("set_channel_readonly", { p_channel: R().cid, p_on: on === "on" }).then(({ error }) => {
      if (error) return toast(error.message.includes("Only admins") ? "Only admins can do that." : "Could not change that. Did you run the SQL?");
      toast(on === "on" ? "This channel is now read-only." : "This channel is open again.");
      guard();
    });
    return true;
  }
  return false; // unknown command: sends as a normal message
}

// "true" at the end means: run before Rally's own handlers
$("inp").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.isComposing) return;
  if (handleCommand()) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
$("send").addEventListener("click", (e) => {
  if (handleCommand()) e.stopImmediatePropagation();
}, true);