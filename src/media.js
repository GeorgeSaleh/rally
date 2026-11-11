import { supabase } from "./supabase.js";
import "emoji-picker-element";

const $ = (id) => document.getElementById(id);
const GIPHY_KEY = import.meta.env.VITE_GIPHY_KEY;
const MAX = 5 * 1024 * 1024;
const TYPES = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
const inp = $("inp");
const msgs = $("msgs");
let uid = null, gifTimer = null, sending = false;
const attCache = new Map();
const signed = new Map();

const css = document.createElement("style");
css.textContent = `
.mpop{position:fixed;z-index:52;display:none;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden;max-width:calc(100vw - 16px)}
.mpop.on{display:block}
.mpop emoji-picker{--background:var(--panel);--border-color:var(--line);--input-border-color:var(--line);--input-font-color:var(--text);--button-hover-background:var(--raised);--outline-color:var(--accent);--indicator-color:var(--accent);--category-font-color:var(--muted);--num-columns:8;width:340px;max-width:calc(100vw - 18px);height:390px}
.gifpop{width:340px}
.gifpop input{width:calc(100% - 20px);margin:10px;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
.gifgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:0 10px 6px;max-height:300px;overflow-y:auto}
.gifgrid img{width:100%;border-radius:8px;cursor:pointer;display:block;background:var(--raised)}
.gifnote{padding:4px 12px 8px;font-size:11px;color:var(--muted)}
.cmpbtn{padding:0 10px;border-radius:10px;background:var(--raised);color:var(--text);font-weight:700;font-size:14px}
.att{margin:6px 0;max-width:420px}
.att img{max-width:100%;max-height:320px;border-radius:12px;display:block;cursor:zoom-in;background:var(--raised)}
.attfile{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--raised);border:1px solid var(--line);max-width:360px}
.attfile b{display:block;overflow-wrap:anywhere;font-weight:600;font-size:14px}
.attfile small{color:var(--muted)}
.attfile a{margin-left:auto;padding:6px 12px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700;text-decoration:none;font-size:13px}
.lbox{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;padding:20px;cursor:zoom-out}
.lbox.on{display:flex}
.lbox img{max-width:100%;max-height:100%;border-radius:10px}
.mt:empty{display:none}`;
document.head.append(css);

supabase.auth.getSession().then(({ data }) => { uid = data.session ? data.session.user.id : null; });
supabase.auth.onAuthStateChange((_e, s) => { uid = s && s.user ? s.user.id : null; });

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

const oldBtn = $("emojibtn");
if (oldBtn) oldBtn.remove();
const oldPop = $("emojipop");
if (oldPop) oldPop.remove();

const pops = [];
function makePop(cls) {
  const p = h("div", "mpop " + cls);
  document.body.append(p);
  pops.push(p);
  return p;
}
function openPop(pop, btn) {
  const was = pop.classList.contains("on");
  pops.forEach((p) => p.classList.remove("on"));
  if (was) return;
  pop.classList.add("on");
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth || 340;
  pop.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + "px";
  pop.style.bottom = window.innerHeight - r.top + 8 + "px";
}
document.addEventListener("click", (e) => {
  if (e.target instanceof Element && !e.target.closest(".mpop, .cmpbtn")) pops.forEach((p) => p.classList.remove("on"));
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") pops.forEach((p) => p.classList.remove("on")); });

function insertText(t) {
  const s = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
  const en = inp.selectionEnd == null ? s : inp.selectionEnd;
  inp.value = inp.value.slice(0, s) + t + inp.value.slice(en);
  inp.focus();
  inp.setSelectionRange(s + t.length, s + t.length);
}

const emojiPop = makePop("");
const picker = document.createElement("emoji-picker");
picker.className = document.documentElement.dataset.theme === "light" ? "light" : "dark";
picker.addEventListener("emoji-click", (e) => insertText(e.detail.unicode));
emojiPop.append(picker);

const gifPop = makePop("gifpop");
const gq = h("input");
gq.placeholder = "Search GIFs";
gq.autocomplete = "off";
const grid = h("div", "gifgrid");
gifPop.append(gq, grid, h("div", "gifnote", "Powered by GIPHY"));

function gifKey() { return GIPHY_KEY; }
async function loadGifs(q) {
  grid.textContent = "";
  if (!gifKey()) { grid.textContent = "GIFs are not set up yet. Add a Giphy key (see the setup steps)."; return; }
  grid.textContent = "Loading...";
  const base = "https://api.giphy.com/v1/gifs/" + (q ? "search" : "trending");
  const url = base + "?api_key=" + encodeURIComponent(gifKey()) + "&limit=24&rating=g" + (q ? "&q=" + encodeURIComponent(q) : "");
  try {
    const r = await fetch(url);
    const j = await r.json();
    grid.textContent = "";
    const items = j.data || [];
    if (!items.length) { grid.textContent = "No GIFs found."; return; }
    items.forEach((it) => {
      const small = (it.images.fixed_width_small || it.images.fixed_width || it.images.original).url;
      const img = h("img");
      img.src = small;
      img.alt = it.title || "GIF";
      img.loading = "lazy";
      img.onclick = () => sendGif(it);
      grid.append(img);
    });
  } catch (e) {
    grid.textContent = "Could not load GIFs. Try again.";
  }
}
gq.oninput = () => { clearTimeout(gifTimer); gifTimer = setTimeout(() => loadGifs(gq.value.trim()), 350); };

async function insertMessage(extra) {
  const cid = window.rally && window.rally.cid;
  if (!cid || !uid || sending) return false;
  sending = true;
  const { error } = await supabase.from("messages").insert({ channel_id: cid, user_id: uid, content: "", ...extra });
  sending = false;
  if (error) {
    toast(error.message.includes("Slow down") ? "You are sending messages too fast." : "Could not send that. Is the media SQL run?");
    return false;
  }
  return true;
}
async function sendGif(it) {
  const url = (it.images.downsized_medium || it.images.fixed_height || it.images.original).url;
  pops.forEach((p) => p.classList.remove("on"));
  const text = inp.value.trim();
  if (await insertMessage({ content: text, att_kind: "gif", att_url: url, att_name: (it.title || "GIF").slice(0, 120) })) inp.value = "";
}
async function sendFile(f) {
  const cid = window.rally && window.rally.cid;
  if (!cid || !uid) return;
  if (!TYPES[f.type]) return toast("That file type is not allowed. Use images, PDF, text, Word, PowerPoint, or Excel files.");
  if (f.size > MAX) return toast("That file is bigger than 5 MB.");
  toast("Uploading...");
  const path = "ch/" + cid + "/" + crypto.randomUUID() + "." + TYPES[f.type];
  const { error } = await supabase.storage.from("attachments").upload(path, f, { contentType: f.type });
  if (error) return toast("Could not upload that file.");
  const kind = f.type.startsWith("image/") ? "image" : "file";
  const ok = await insertMessage({ content: inp.value.trim(), att_kind: kind, att_path: path, att_name: f.name.slice(0, 120), att_size: f.size });
  if (ok) inp.value = "";
  else supabase.storage.from("attachments").remove([path]);
}

const send = $("send");
const bFile = h("button", "cmpbtn", "📎");
bFile.type = "button";
bFile.title = "Upload a file or image";
bFile.setAttribute("aria-label", "Upload a file or image");
const bGif = h("button", "cmpbtn", "GIF");
bGif.type = "button";
bGif.title = "Send a GIF";
bGif.setAttribute("aria-label", "Send a GIF");
const bEmo = h("button", "cmpbtn", "😊");
bEmo.type = "button";
bEmo.title = "Emoji";
bEmo.setAttribute("aria-label", "Emoji");
send.before(bFile, bGif, bEmo);
const fileIn = h("input");
fileIn.type = "file";
fileIn.hidden = true;
fileIn.accept = Object.keys(TYPES).join(",");
document.body.append(fileIn);
bFile.onclick = () => fileIn.click();
fileIn.onchange = () => { const f = fileIn.files[0]; fileIn.value = ""; if (f) sendFile(f); };
bGif.onclick = (e) => { e.stopPropagation(); openPop(gifPop, bGif); if (gifPop.classList.contains("on")) { gq.value = ""; loadGifs(""); gq.focus(); } };
bEmo.onclick = (e) => { e.stopPropagation(); picker.className = document.documentElement.dataset.theme === "light" ? "light" : "dark"; openPop(emojiPop, bEmo); };
inp.addEventListener("paste", (e) => {
  const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
  if (f) { e.preventDefault(); sendFile(f); }
});

const lbox = h("div", "lbox");
const limg = h("img");
lbox.append(limg);
document.body.append(lbox);
lbox.onclick = () => lbox.classList.remove("on");
document.addEventListener("keydown", (e) => { if (e.key === "Escape") lbox.classList.remove("on"); });

function size(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
function build(el) {
  const r = attCache.get(el.dataset.id);
  if (!r || el.querySelector(".att")) return;
  const wrap = h("div", "att");
  if (r.att_kind === "gif" || r.att_kind === "image") {
    const src = r.att_kind === "gif" ? r.att_url : signed.get(r.att_path);
    if (!src) return;
    const img = h("img");
    img.src = src;
    img.alt = r.att_name || "image";
    img.loading = "lazy";
    img.onclick = () => { limg.src = src; lbox.classList.add("on"); };
    wrap.append(img);
  } else {
    const url = signed.get(r.att_path);
    if (!url) return;
    const card = h("div", "attfile");
    card.append(h("span", "", "📄"));
    const info = h("div");
    info.append(h("b", "", r.att_name || "file"), h("small", "", r.att_size ? size(r.att_size) : ""));
    const a = h("a", "", "Download");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = r.att_name || "file";
    card.append(info, a);
    wrap.append(card);
  }
  const mt = el.querySelector(".mt");
  if (mt) mt.after(wrap);
}
async function decorate(els) {
  const need = els.map((e) => e.dataset.id).filter((i) => !attCache.has(i));
  if (need.length) {
    const { data } = await supabase.from("messages").select("id,att_kind,att_path,att_url,att_name,att_size").in("id", need);
    need.forEach((i) => attCache.set(i, null));
    (data || []).forEach((r) => { if (r.att_kind) attCache.set(String(r.id), r); });
  }
  const paths = els.map((e) => attCache.get(e.dataset.id)).filter((r) => r && r.att_path && !signed.has(r.att_path)).map((r) => r.att_path);
  if (paths.length) {
    const { data } = await supabase.storage.from("attachments").createSignedUrls(paths, 3600);
    (data || []).forEach((s) => { if (s.signedUrl) signed.set(s.path, s.signedUrl); });
  }
  els.forEach(build);
}
new MutationObserver((muts) => {
  const els = [];
  muts.forEach((mu) => mu.addedNodes.forEach((n) => {
    if (n.nodeType === 1 && n.classList.contains("m") && n.dataset.id) els.push(n);
  }));
  if (els.length) decorate(els);
}).observe(msgs, { childList: true });