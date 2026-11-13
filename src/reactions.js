import { supabase } from "./supabase.js";
import { removeByUrl } from "./profiles.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const data = new Map();
const msgs = $("msgs");
let uid = null, rank = "none";
const isAdmin = () => R().role === "admin" || rank !== "none";

const style = document.createElement("style");
style.textContent = `
.rx{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;align-items:center}
.rx:empty{display:none}
.rx button{padding:2px 8px;border-radius:999px;background:var(--raised);color:var(--text);font-size:13px;border:1px solid transparent}
.rx button.me{border-color:var(--accent)}
.rx .rce-img{width:1.2em;height:1.2em;vertical-align:-0.25em}
.rxpick{display:flex;flex-wrap:wrap;gap:2px;max-width:300px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:2px 4px}
.rxpick button{font-size:18px;padding:2px 5px;border:0;background:none}
.rxpick .rce-img{width:24px;height:24px}
#rce-btn{padding:0 14px;border-radius:12px;background:var(--raised);color:var(--text);font-weight:700}
.rce-img{width:1.5em;height:1.5em;vertical-align:-0.35em;object-fit:contain}
.rce-img.rce-big{width:48px;height:48px;vertical-align:middle}
#rce-addbox{background:var(--raised);border-radius:12px;padding:12px;margin:10px 0}
#rce-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px;margin:10px 0}
.rce-cell{position:relative}
.rce-pick{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;padding:8px 4px;border-radius:10px;background:var(--raised);color:var(--text);font-size:11px;overflow:hidden}
.rce-pick:hover{background:var(--panel)}
.rce-pick img{width:36px;height:36px;object-fit:contain}
.rce-pick span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rce-del{position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:var(--pink);color:#fff;font-size:11px;line-height:20px}
.rce-sec{font-weight:700;font-size:12px;letter-spacing:.06em;color:var(--muted);margin:0 0 4px;text-transform:uppercase}
#rce-file{display:block;margin:6px 0 10px;font-size:13px;max-width:100%}
#rce-status{min-height:20px;font-size:14px;margin:6px 0 0;overflow-wrap:anywhere}`;
document.head.append(style);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="rce-ov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="rce-title" style="max-width:520px;width:100%;max-height:92%;overflow-y:auto">
  <h2 id="rce-title">Server emojis</h2>
  <div id="rce-addbox">
    <div class="rce-sec">Add an emoji</div>
    <p class="sub">PNG, GIF, WEBP or JPG, up to 256 KB. Animated GIFs work. You can add 5 per server. Keep it school-appropriate.</p>
    <input class="tx" id="rce-name" maxlength="20" placeholder="Name, like party_blob" autocomplete="off">
    <input type="file" id="rce-file" accept="image/png,image/gif,image/webp,image/jpeg">
    <button class="go amber" id="rce-add">Add emoji</button>
    <p id="rce-status" role="status"></p>
  </div>
  <p class="sub">Click an emoji to add it to your message, or type :name: yourself. You can also react with them. These only work in this server.</p>
  <div id="rce-grid"></div>
  <div class="row"><button class="cancel" id="rce-close">Close</button></div>
</div></div>`);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 3200);
}
function say(t, ok) {
  const s = $("rce-status");
  s.textContent = t;
  s.style.color = ok ? "var(--accent)" : "var(--pink)";
}

const ready = supabase.auth.getSession().then(({ data: d }) => {
  uid = d.session ? d.session.user.id : null;
});
supabase.auth.onAuthStateChange((_e, s) => {
  uid = s && s.user ? s.user.id : null;
  setTimeout(checkRank, 0);
});
async function checkRank() {
  const { data: d } = await supabase.auth.getSession();
  if (!d.session) { rank = "none"; return; }
  const { data: r } = await supabase.rpc("my_rank");
  rank = r === "owner" || r === "admin" ? r : "none";
}
checkRank();

// ================= CUSTOM EMOJI DATA =================
let emojiList = [], emojiMap = new Map(), emojiGid = null, emojiAt = 0, emojiVer = 0;

// A reaction like ":party_blob:" becomes a picture when the server has that emoji
function emoNode(e) {
  const m = /^:([a-z0-9_]{2,20}):$/.exec(e);
  if (m && emojiMap.has(m[1])) {
    const i = document.createElement("img");
    i.className = "rce-img";
    i.src = emojiMap.get(m[1]);
    i.alt = e;
    i.title = e;
    i.draggable = false;
    return i;
  }
  return document.createTextNode(e);
}

async function loadEmojis(force) {
  const gid = R().gid;
  if (!gid) { emojiList = []; emojiMap = new Map(); emojiGid = null; emojiVer++; return; }
  if (!force && gid === emojiGid && Date.now() - emojiAt < 60000) return;
  const { data: d, error } = await supabase.from("custom_emojis").select("id,name,url,created_by").eq("group_id", gid).order("name");
  if (gid !== R().gid) return;
  if (error) console.error("[emoji] could not load emojis:", error.message);
  emojiGid = gid;
  emojiAt = Date.now();
  emojiList = error ? [] : d;
  emojiMap = new Map(emojiList.filter((e) => /^https:\/\//.test(e.url)).map((e) => [e.name, e.url]));
  emojiVer++;
  refreshMsgs();
  msgs.querySelectorAll(".m[data-id]").forEach((el) => { if (el.querySelector(".rx")) render(el); });
  if ($("rce-ov").classList.contains("on")) drawGrid();
}

// Turns :name: inside message text into pictures
function renderEmoji(mt) {
  const raw = mt.dataset.raw;
  if (raw === undefined) return;
  const key = emojiVer + "|" + raw;
  if (mt.dataset.rce === key && (mt.dataset.rceHas !== "1" || mt.querySelector(".rce-img"))) return;
  mt.dataset.rce = key;
  mt.dataset.rceHas = "";
  if (!emojiMap.size || !raw.includes(":")) return;
  const parts = raw.split(/(:[a-z0-9_]{2,20}:)/g);
  const isEmo = (p) => /^:[a-z0-9_]{2,20}:$/.test(p) && emojiMap.has(p.slice(1, -1));
  if (!parts.some(isEmo)) return;
  const only = parts.every((p) => !p.trim() || isEmo(p));
  const ed = mt.querySelector(".ed");
  mt.textContent = "";
  parts.forEach((p) => {
    if (isEmo(p)) {
      const img = document.createElement("img");
      img.className = "rce-img" + (only ? " rce-big" : "");
      img.src = emojiMap.get(p.slice(1, -1));
      img.alt = p;
      img.title = p;
      img.draggable = false;
      mt.append(img);
    } else if (p) {
      mt.append(p);
    }
  });
  if (ed) mt.append(ed);
  mt.dataset.rceHas = "1";
}
function refreshMsgs() {
  msgs.querySelectorAll(".m .mt").forEach(renderEmoji);
}
let msgTimer = null;
new MutationObserver(() => {
  clearTimeout(msgTimer);
  msgTimer = setTimeout(refreshMsgs, 80);
}).observe(msgs, { childList: true, subtree: true });
new MutationObserver(() => loadEmojis(false)).observe($("cname"), { childList: true, characterData: true, subtree: true });
setInterval(() => { if (!document.hidden) loadEmojis(false); }, 60000);

// ================= REACTIONS =================
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
  const act = el.querySelector(".act");
  if (!act) return;
  let rx = el.querySelector(".rx");
  if (!rx) {
    rx = document.createElement("div");
    rx.className = "rx";
    act.before(rx);
  }
  rx.textContent = "";
  const m = data.get(id) || new Map();
  for (const [emoji, users] of m) {
    if (!users.size) continue;
    const b = document.createElement("button");
    b.className = users.has(uid) ? "me" : "";
    b.append(emoNode(emoji), " " + users.size);
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
    // this server's custom emojis
    emojiList.slice(0, 24).forEach((e) => {
      const tag = ":" + e.name + ":";
      const b = document.createElement("button");
      b.title = tag;
      b.append(emoNode(tag));
      b.onclick = () => toggle(id, tag);
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
    if (emoji.startsWith(":")) {
      console.error("[reactions] custom reaction failed:", error);
      toast("Could not react with that emoji: " + error.message);
    }
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

// ================= EMOJI WINDOW (the ⭐ button) =================
const btn = document.createElement("button");
btn.id = "rce-btn";
btn.textContent = "⭐";
btn.title = "Server emojis";
btn.setAttribute("aria-label", "Server emojis");
$("send").before(btn);

function drawGrid() {
  const g = $("rce-grid");
  g.textContent = "";
  if (!emojiList.length) {
    const p = document.createElement("p");
    p.className = "sub";
    p.textContent = "No emojis in this server yet. Add the first one above.";
    g.append(p);
    return;
  }
  emojiList.forEach((e) => {
    const cell = document.createElement("div");
    cell.className = "rce-cell";
    const pick = document.createElement("button");
    pick.className = "rce-pick";
    const img = document.createElement("img");
    img.src = e.url;
    img.alt = ":" + e.name + ":";
    const nm = document.createElement("span");
    nm.textContent = ":" + e.name + ":";
    pick.append(img, nm);
    pick.onclick = () => {
      const inp = $("inp");
      inp.value += (inp.value && !inp.value.endsWith(" ") ? " " : "") + ":" + e.name + ": ";
      closeDlg();
      inp.focus();
    };
    cell.append(pick);
    if (isAdmin() || e.created_by === uid) {
      const del = document.createElement("button");
      del.className = "rce-del";
      del.textContent = "✕";
      del.title = "Delete this emoji";
      del.onclick = async () => {
        if (!confirm("Delete :" + e.name + ":?")) return;
        const { error } = await supabase.rpc("delete_custom_emoji", { p_emoji: e.id });
        if (error) return say("Could not delete it: " + error.message);
        removeByUrl(e.url);
        loadEmojis(true);
      };
      cell.append(del);
    }
    g.append(cell);
  });
}
async function openDlg() {
  if (!R().gid) return toast("Open a server first.");
  say("");
  $("rce-ov").classList.add("on");
  await loadEmojis(true);
  drawGrid();
}
function closeDlg() { $("rce-ov").classList.remove("on"); }

async function addEmoji() {
  const gid = R().gid;
  const name = $("rce-name").value.trim().toLowerCase();
  const f = $("rce-file").files[0];
  if (!gid || !uid) return say("Open a server first.");
  if (!/^[a-z0-9_]{2,20}$/.test(name)) return say("Name: 2 to 20 letters, numbers or _ (no spaces).");
  if (!f) return say("Pick an image first.");
  if (!TYPES[f.type]) return say("Use a PNG, GIF, WEBP or JPG image.");
  if (f.size > 262144) return say("That image is " + Math.round(f.size / 1024) + " KB. Emojis must be under 256 KB.");
  $("rce-add").disabled = true;
  say("Uploading...", true);

  const path = "users/" + uid + "/emoji-" + Date.now() + "." + TYPES[f.type];
  const up = await supabase.storage.from("images").upload(path, f, { contentType: f.type, cacheControl: "31536000" });
  if (up.error) {
    $("rce-add").disabled = false;
    console.error("[emoji] upload failed:", up.error);
    return say("Upload failed: " + up.error.message);
  }
  const url = supabase.storage.from("images").getPublicUrl(path).data.publicUrl;

  const { error } = await supabase.rpc("add_custom_emoji", { p_group: gid, p_name: name, p_url: url });
  $("rce-add").disabled = false;
  if (error) {
    removeByUrl(url);
    console.error("[emoji] save failed:", error);
    const m = error.message || "";
    return say(
      m.includes("Name taken") ? "That name is already used."
      : m.includes("Your emoji limit") ? "You can add 5 emojis per server. Delete one first."
      : m.includes("Too many") ? "This server already has 50 emojis."
      : m.includes("muted") ? "You are muted, so you cannot add emojis."
      : m.includes("banned") ? "Your account is banned."
      : "Save failed: " + m
    );
  }
  $("rce-name").value = "";
  $("rce-file").value = "";
  say("Added! Use it by typing :" + name + ":", true);
  loadEmojis(true);
}

btn.onclick = openDlg;
$("rce-add").onclick = addEmoji;
$("rce-close").onclick = closeDlg;
$("rce-ov").onclick = (e) => { if (e.target === $("rce-ov")) closeDlg(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDlg(); });