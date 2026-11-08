import { supabase } from "./supabase.js";

const msgs = document.getElementById("msgs");
const inp = document.getElementById("inp");
let myName = "";

const css = document.createElement("style");
css.textContent = `
.mt code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em;background:rgba(127,127,160,.22);padding:1px 6px;border-radius:6px}
.mt a{color:var(--accent);text-decoration:underline;overflow-wrap:anywhere}
.mt .men{background:rgba(255,181,71,.18);color:var(--accent);padding:0 4px;border-radius:5px;font-weight:600}
.mt .men.me{background:rgba(255,92,138,.22);color:var(--pink)}
#emojibtn{font-size:20px;padding:0 6px;border-radius:10px;background:var(--raised)}
#emojipop{position:fixed;z-index:50;display:none;grid-template-columns:repeat(8,1fr);gap:2px;padding:8px;border-radius:14px;background:var(--panel);border:1px solid var(--line);box-shadow:0 12px 40px rgba(0,0,0,.4);max-width:calc(100vw - 24px)}
#emojipop.on{display:grid}
#emojipop button{font-size:22px;padding:4px;border-radius:8px}
#emojipop button:hover{background:var(--raised)}`;
document.head.append(css);

supabase.auth.getSession().then(async ({ data }) => {
  const u = data.session && data.session.user;
  if (!u) return;
  const { data: p } = await supabase.from("profiles").select("username").eq("id", u.id).maybeSingle();
  if (p) myName = p.username.toLowerCase();
});

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\*[^*\s](?:[^*]*[^*\s])?\*|https?:\/\/[^\s<]+|@[A-Za-z0-9_]{3,20})/g;
function render(mt) {
  const raw = mt.dataset.raw;
  if (raw === undefined || mt.dataset.fmt === raw) return;
  const ed = mt.querySelector(".ed");
  const frag = document.createDocumentFragment();
  raw.split(TOKEN).forEach((part) => {
    if (!part) return;
    let el = null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      el = document.createElement("strong");
      el.textContent = part.slice(2, -2);
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      el = document.createElement("code");
      el.textContent = part.slice(1, -1);
    } else if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      el = document.createElement("s");
      el.textContent = part.slice(2, -2);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      el = document.createElement("em");
      el.textContent = part.slice(1, -1);
    } else if (/^https?:\/\//.test(part)) {
      const m = part.match(/^(.*?)([.,!?)]*)$/);
      el = document.createElement("a");
      el.href = m[1];
      el.textContent = m[1];
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      frag.append(el);
      if (m[2]) frag.append(m[2]);
      return;
    } else if (part.startsWith("@") && part.length > 3) {
      el = document.createElement("span");
      el.className = "men" + (part.slice(1).toLowerCase() === myName ? " me" : "");
      el.textContent = part;
    }
    frag.append(el || part);
  });
  mt.dataset.fmt = raw;
  mt.textContent = "";
  mt.append(frag);
  if (ed) mt.append(ed);
}
function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.classList && root.classList.contains("mt")) render(root);
  root.querySelectorAll && root.querySelectorAll(".mt").forEach(render);
}
new MutationObserver((muts) => {
  muts.forEach((mu) => {
    mu.addedNodes.forEach(scan);
    const t = mu.target.nodeType === 1 ? mu.target : mu.target.parentElement;
    if (t && t.classList && t.classList.contains("mt")) render(t);
  });
}).observe(msgs, { childList: true, subtree: true });
msgs.querySelectorAll(".mt").forEach(render);

const EMOJI = ["😀","😂","🤣","😊","😍","🥰","😎","🤩","😭","😅","😉","🙃","🤔","😴","😡","🥳","👍","👎","👏","🙌","🙏","💪","👀","🔥","✨","💯","🎉","❤️","💔","💜","🧡","😮","😢","😱","🤯","🫡","😬","🙄","😇","🤝","☕","🍕","🎮","📚","✅","❌","⭐","🚀"];
const pop = document.createElement("div");
pop.id = "emojipop";
EMOJI.forEach((e) => {
  const b = document.createElement("button");
  b.textContent = e;
  b.onclick = () => {
    const s = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
    const en = inp.selectionEnd == null ? s : inp.selectionEnd;
    inp.value = inp.value.slice(0, s) + e + inp.value.slice(en);
    inp.focus();
    inp.setSelectionRange(s + e.length, s + e.length);
    pop.classList.remove("on");
  };
  pop.append(b);
});
document.body.append(pop);
const btn = document.createElement("button");
btn.id = "emojibtn";
btn.type = "button";
btn.textContent = "😊";
btn.title = "Emoji";
btn.setAttribute("aria-label", "Emoji");
document.getElementById("send").before(btn);
btn.onclick = (ev) => {
  ev.stopPropagation();
  if (pop.classList.toggle("on")) {
    const r = btn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left - 120, window.innerWidth - 300)) + "px";
    pop.style.bottom = window.innerHeight - r.top + 8 + "px";
  }
};
document.addEventListener("click", (e) => { if (!pop.contains(e.target)) pop.classList.remove("on"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.classList.remove("on"); });
inp.title = "Formatting: **bold**, *italic*, `code`, ~~strike~~, @username";