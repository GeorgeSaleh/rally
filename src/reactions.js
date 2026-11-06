import { supabase } from "./supabase.js";

const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
const data = new Map();
const msgs = document.getElementById("msgs");
let uid = null;

const style = document.createElement("style");
style.textContent = `
.rx{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;align-items:center}
.rx:empty{display:none}
.rx button{padding:2px 8px;border-radius:999px;background:var(--raised);color:var(--text);font-size:13px;border:1px solid transparent}
.rx button.me{border-color:var(--accent)}
.rxpick{display:flex;gap:2px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:2px 4px}
.rxpick button{font-size:18px;padding:2px 5px;border:0;background:none}`;
document.head.append(style);

const ready = supabase.auth.getSession().then(({ data: d }) => {
  uid = d.session ? d.session.user.id : null;
});
supabase.auth.onAuthStateChange((_e, s) => {
  uid = s && s.user ? s.user.id : null;
});

function add(r) {
  const id = String(r.message_id);
  let m = data.get(id);
  if (!m) { m = new Map(); data.set(id, m); }
  let s = m.get(r.emoji);
  if (!s) { s = new Set(); m.set(r.emoji, s); }
  s.add(r.user_id);
}
function drop(r) {
  const m = data.get(String(r.message_id));
  const s = m && m.get(r.emoji);
  if (s) s.delete(r.user_id);
}
function elFor(id) {
  return msgs.querySelector('[data-id="' + id + '"]');
}
function render(el) {
  const id = el.dataset.id;
  let rx = el.querySelector(".rx");
  if (!rx) {
    rx = document.createElement("div");
    rx.className = "rx";
    el.querySelector(".act").before(rx);
  }
  rx.textContent = "";
  const m = data.get(id) || new Map();
  for (const [emoji, users] of m) {
    if (!users.size) continue;
    const b = document.createElement("button");
    b.className = users.has(uid) ? "me" : "";
    b.textContent = emoji + " " + users.size;
    b.onclick = () => toggle(id, emoji);
    rx.append(b);
  }
  if (rx.dataset.open === "1") {
    const p = document.createElement("div");
    p.className = "rxpick";
    EMOJI.forEach((e) => {
      const b = document.createElement("button");
      b.textContent = e;
      b.onclick = () => toggle(id, e);
      p.append(b);
    });
    rx.append(p);
  }
}
function refresh(id) {
  const el = elFor(id);
  if (el) render(el);
}
async function toggle(id, emoji) {
  if (!uid) return;
  const el = elFor(id);
  const rx = el && el.querySelector(".rx");
  if (rx) rx.dataset.open = "";
  const m = data.get(id) || new Map();
  data.set(id, m);
  const users = m.get(emoji) || new Set();
  m.set(emoji, users);
  const had = users.has(uid);
  if (had) users.delete(uid); else users.add(uid);
  refresh(id);
  const { error } = had
    ? await supabase.from("reactions").delete().eq("message_id", id).eq("user_id", uid).eq("emoji", emoji)
    : await supabase.from("reactions").insert({ message_id: id, user_id: uid, emoji });
  if (error) {
    if (had) users.add(uid); else users.delete(uid);
    refresh(id);
  }
}
async function load(els) {
  await ready;
  const ids = els.map((e) => e.dataset.id);
  const { data: rows } = await supabase.from("reactions").select("message_id,user_id,emoji").in("message_id", ids);
  ids.forEach((id) => data.set(id, new Map()));
  (rows || []).forEach(add);
  els.forEach((el) => {
    render(el);
    const btn = [...el.querySelectorAll(".act button")].find((b) => b.textContent === "React");
    if (btn) {
      btn.onclick = () => {
        const rx = el.querySelector(".rx");
        rx.dataset.open = rx.dataset.open === "1" ? "" : "1";
        render(el);
      };
    }
  });
}

new MutationObserver((muts) => {
  const els = [];
  muts.forEach((mu) => mu.addedNodes.forEach((n) => {
    if (n.nodeType === 1 && n.classList.contains("m") && n.dataset.id) els.push(n);
  }));
  if (els.length) load(els);
}).observe(msgs, { childList: true });

ready.then(() => {
  supabase
    .channel("reactions-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions" }, (p) => {
      add(p.new);
      refresh(String(p.new.message_id));
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, (p) => {
      drop(p.old);
      refresh(String(p.old.message_id));
    })
    .subscribe();
});