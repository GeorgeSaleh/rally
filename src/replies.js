import { supabase } from "./supabase.js";

const msgs = document.getElementById("msgs");
const inp = document.getElementById("inp");
const sendBtn = document.getElementById("send");
const cache = new Map();
const rmap = new Map();
const names = {};
let uid = null, target = null, lastCid = null, sending = false;

const css = document.createElement("style");
css.textContent = `
.rq{border-left:3px solid var(--pink);background:var(--raised);padding:4px 10px;border-radius:6px;margin:4px 0;font-size:13px;color:var(--muted);cursor:pointer;max-width:520px;overflow:hidden;overflow-wrap:anywhere}
.rq b{display:block;color:var(--text);font-weight:600;font-size:12px}
.m.toyou{background:rgba(255,92,138,.08);box-shadow:inset 3px 0 0 var(--pink);border-radius:10px;padding:6px 8px}
.m.flash{animation:rflash 1.4s ease-out}
@keyframes rflash{0%{background:rgba(255,181,71,.4)}100%{background:transparent}}
#replybar{display:none;align-items:center;gap:10px;margin:0 16px 8px;padding:8px 12px;border-left:3px solid var(--pink);background:var(--raised);border-radius:8px;font-size:13px;color:var(--muted)}
#replybar.on{display:flex}
#replybar span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#replybar b{color:var(--text)}
#replybar button{padding:2px 10px;border-radius:8px;color:var(--muted)}
#replybar button:hover{background:var(--panel);color:var(--text)}`;
document.head.append(css);

const bar = document.createElement("div");
bar.id = "replybar";
const barText = document.createElement("span");
const barX = document.createElement("button");
barX.textContent = "✕";
barX.setAttribute("aria-label", "Cancel reply");
bar.append(barText, barX);
document.querySelector(".cmp").before(bar);

supabase.auth.getSession().then(({ data }) => { uid = data.session ? data.session.user.id : null; });
supabase.auth.onAuthStateChange((_e, s) => { uid = s && s.user ? s.user.id : null; });

function toast(t) {
  const e = document.getElementById("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2800);
}
function plain(t) { return (t || "").replace(/\s+/g, " ").trim(); }
function snippet(t) { const s = plain(t); return s.length > 110 ? s.slice(0, 110) + "..." : s; }
function resetPlaceholder() {
  const c = (document.getElementById("cname").textContent || "").replace(/^#\s*/, "#").trim();
  inp.placeholder = c ? "Message " + c : "Message";
}
function clearReply() {
  target = null;
  bar.classList.remove("on");
  resetPlaceholder();
}
function startReply(el) {
  const mt = el.querySelector(".mt");
  const name = el.querySelector(".n") ? el.querySelector(".n").textContent : "someone";
  target = { id: el.dataset.id };
  barText.textContent = "";
  const b = document.createElement("b");
  b.textContent = name;
  barText.append("Replying to ", b, ": " + snippet(mt ? mt.dataset.raw : ""));
  bar.classList.add("on");
  inp.placeholder = "Replying to " + name;
  inp.focus();
}
barX.onclick = clearReply;
document.addEventListener("rally-reply-sent", clearReply);
setInterval(() => {
  const cid = window.rally && window.rally.cid;
  if (cid !== lastCid) { lastCid = cid; if (target) clearReply(); }
}, 500);

async function sendReply() {
  const t = inp.value.trim();
  const cid = window.rally && window.rally.cid;
  if (!t || !target || !cid || !uid || sending) return;
  sending = true;
  inp.value = "";
  const rid = target.id;
  const { data, error } = await supabase
    .from("messages")
    .insert({ channel_id: cid, user_id: uid, content: t, reply_to: rid })
    .select("id,reply_to")
    .single();
  sending = false;
  if (error) {
    inp.value = t;
    return toast(
      error.message.includes("Slow down") ? "You are sending messages too fast."
      : error.message.includes("reply_to") ? "Replies are not set up yet. Run the reply SQL in Supabase."
      : "Could not send your reply. Try again."
    );
  }
  rmap.set(String(data.id), String(data.reply_to));
  clearReply();
  setTimeout(() => {
    if (!msgs.querySelector('[data-id="' + data.id + '"]') && window.rally && window.rally.refresh) window.rally.refresh();
  }, 1800);
}
function intercept(e) {
  if (!target) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  sendReply();
}
sendBtn.addEventListener("click", intercept, true);
inp.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && target) return clearReply();
  if (e.key === "Enter" && target) intercept(e);
}, true);

async function nameOf(id) {
  if (!names[id]) {
    const { data } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
    names[id] = data ? data.username : "Unknown";
  }
  return names[id];
}
async function loadReplyIds(els) {
  const need = els.map((e) => e.dataset.id).filter((i) => !rmap.has(i));
  if (!need.length) return;
  const { data } = await supabase.from("messages").select("id,reply_to").in("id", need);
  need.forEach((i) => rmap.set(i, null));
  (data || []).forEach((r) => rmap.set(String(r.id), r.reply_to ? String(r.reply_to) : null));
}
async function loadOriginals(ids) {
  const need = [...new Set(ids)].filter((i) => !cache.has(i));
  if (!need.length) return;
  const { data } = await supabase.from("messages").select("id,user_id,content").in("id", need);
  need.forEach((i) => cache.set(i, null));
  (data || []).forEach((r) => cache.set(String(r.id), r));
}
async function decorate(els) {
  await loadReplyIds(els);
  await loadOriginals(els.map((e) => rmap.get(e.dataset.id)).filter(Boolean));
  for (const el of els) {
    const btn = [...el.querySelectorAll(".act button")].find((b) => b.textContent === "Reply");
    if (btn) btn.onclick = () => startReply(el);
    const rid = rmap.get(el.dataset.id);
    if (!rid || el.querySelector(".rq")) continue;
    const orig = cache.get(rid);
    const q = document.createElement("div");
    q.className = "rq";
    const who = document.createElement("b");
    if (orig) {
      who.textContent = "↪ " + (await nameOf(orig.user_id));
      q.append(who, snippet(orig.content));
      if (orig.user_id === uid && el.dataset.user !== uid) el.classList.add("toyou");
      q.onclick = () => {
        const t = msgs.querySelector('[data-id="' + rid + '"]');
        if (!t) return;
        t.scrollIntoView({ behavior: "smooth", block: "center" });
        t.classList.remove("flash");
        void t.offsetWidth;
        t.classList.add("flash");
      };
    } else {
      who.textContent = "↪ Original message";
      q.append(who, "The original message was deleted or is not available.");
      q.style.cursor = "default";
    }
    const mt = el.querySelector(".mt");
    if (mt) mt.before(q);
  }
}
new MutationObserver((muts) => {
  const els = [];
  muts.forEach((mu) => mu.addedNodes.forEach((n) => {
    if (n.nodeType === 1 && n.classList.contains("m") && n.dataset.id) els.push(n);
  }));
  if (els.length) decorate(els);
}).observe(msgs, { childList: true });