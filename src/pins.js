import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
let pinned = new Set(), lastCid = null;

const css = document.createElement("style");
css.textContent = `
#rpin-btn{padding:6px 12px;border-radius:10px;background:var(--raised);color:var(--text);font-weight:600;margin-right:6px}
.rpin-mark{font-size:12px}
.rpin-toggle{font-weight:600}
#rpin-list{max-height:50vh;overflow-y:auto;margin:10px 0}
.rpin-item{background:var(--raised);border-left:3px solid var(--accent);border-radius:8px;padding:10px;margin-bottom:8px;overflow-wrap:anywhere}
.rpin-item b{margin-right:8px}
.rpin-item small{color:var(--muted)}
.rpin-item p{margin:4px 0 0}
.rpin-acts{display:flex;gap:6px;margin-top:8px}
.rpin-acts button{padding:5px 10px;border-radius:8px;background:var(--panel);color:var(--text);font-weight:600;font-size:13px}
.rpin-empty{color:var(--muted);padding:8px 0}
.m.flash .b{outline:2px solid var(--accent);border-radius:12px}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="rpin-ov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="rpin-title">
  <h2 id="rpin-title">Pinned messages</h2>
  <div id="rpin-list"></div>
  <div class="row"><button class="cancel" id="rpin-close">Close</button></div>
</div></div>`);

const btn = document.createElement("button");
btn.id = "rpin-btn";
btn.textContent = "Pins";
btn.setAttribute("aria-label", "Pinned messages");
$("membtn").before(btn);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2200);
}

async function togglePin(id, on) {
  const { error } = await supabase.rpc("pin_message", { p_msg: id, p_pin: on });
  if (error) return toast(error.message.includes("admin") ? "Only admins can pin messages." : "Could not do that.");
  if (on) pinned.add(String(id)); else pinned.delete(String(id));
  const el = $("msgs").querySelector('[data-id="' + String(id) + '"]');
  if (el) decorate(el);
  toast(on ? "Message pinned." : "Message unpinned.");
}

function decorate(el) {
  const id = el.dataset.id;
  const on = pinned.has(id);

  let mark = el.querySelector(".rpin-mark");
  if (on && !mark) {
    mark = document.createElement("span");
    mark.className = "rpin-mark";
    mark.textContent = " 📌";
    mark.title = "Pinned";
    const head = el.querySelector(".b > div");
    if (head) head.append(mark);
  } else if (!on && mark) {
    mark.remove();
  }

  const act = el.querySelector(".act");
  let pb = el.querySelector(".rpin-toggle");
  if (R().role === "admin" && act) {
    if (!pb) {
      pb = document.createElement("button");
      pb.className = "rpin-toggle";
      pb.onclick = () => togglePin(id, !pinned.has(id));
      act.append(pb);
    }
    pb.textContent = on ? "Unpin" : "Pin";
  } else if (pb) {
    pb.remove();
  }
}

async function loadPins() {
  const cid = R().cid;
  lastCid = cid;
  pinned = new Set();
  if (cid) {
    const { data } = await supabase.from("messages").select("id").eq("channel_id", cid).not("pinned_at", "is", null);
    (data || []).forEach((x) => pinned.add(String(x.id)));
  }
  if (cid !== R().cid) return;
  $("msgs").querySelectorAll(".m").forEach(decorate);
}

new MutationObserver((list) => {
  if (R().cid !== lastCid) return loadPins();
  list.forEach((r) => r.addedNodes.forEach((n) => {
    if (n.nodeType === 1 && n.classList.contains("m")) decorate(n);
  }));
}).observe($("msgs"), { childList: true });

function say(t) {
  const out = $("rpin-list");
  out.textContent = "";
  const d = document.createElement("div");
  d.className = "rpin-empty";
  d.textContent = t;
  out.append(d);
}

function jumpTo(id) {
  closePins();
  const el = $("msgs").querySelector('[data-id="' + String(id) + '"]');
  if (!el) return toast("That message is older than the 100 most recent ones.");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 2000);
}

async function openPins() {
  $("rpin-ov").classList.add("on");
  const cid = R().cid;
  if (!cid) return say("Open a channel first.");
  say("Loading...");
  const { data, error } = await supabase
    .from("messages")
    .select("id,user_id,content,created_at")
    .eq("channel_id", cid)
    .not("pinned_at", "is", null)
    .order("pinned_at", { ascending: false })
    .limit(50);
  if (error) return say("Could not load pinned messages.");
  if (!data.length) return say("No pinned messages yet. Admins can pin one with the Pin button.");

  const ids = [...new Set(data.map((m) => m.user_id))];
  const { data: ps } = await supabase.from("profiles").select("id,username").in("id", ids);
  const names = {};
  (ps || []).forEach((p) => (names[p.id] = p.username));

  const out = $("rpin-list");
  out.textContent = "";
  data.forEach((m) => {
    const item = document.createElement("div");
    item.className = "rpin-item";
    const n = document.createElement("b");
    n.textContent = names[m.user_id] || "Unknown";
    const s = document.createElement("small");
    s.textContent = new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const p = document.createElement("p");
    p.textContent = m.content;
    const acts = document.createElement("div");
    acts.className = "rpin-acts";
    const go = document.createElement("button");
    go.textContent = "Jump to message";
    go.onclick = () => jumpTo(m.id);
    acts.append(go);
    if (R().role === "admin") {
      const un = document.createElement("button");
      un.textContent = "Unpin";
      un.onclick = async () => { await togglePin(m.id, false); item.remove(); if (!out.children.length) say("No pinned messages yet."); };
      acts.append(un);
    }
    item.append(n, s, p, acts);
    out.append(item);
  });
}
function closePins() { $("rpin-ov").classList.remove("on"); }

btn.onclick = openPins;
$("rpin-close").onclick = closePins;
$("rpin-ov").onclick = (e) => { if (e.target === $("rpin-ov")) closePins(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePins(); });