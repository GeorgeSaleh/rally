import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const COLS = ["#ffb547", "#ff5c8a", "#7fd6ff", "#b69cff", "#8be28b", "#ff8a5c", "#5c7cff", "#2dd4bf"];
const STYLES = [["normal", "Normal"], ["glow", "Glow"], ["gradient", "Gradient"], ["mono", "Mono"], ["serif", "Serif"]];
const COLS_SEL = "id,username,color,bio,status,pronouns,banner,name_style,created_at,avatar_url,banner_url";
export const MAX_IMG = 1048576;
const OK_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const P = {};
let uid = null;

const css = document.createElement("style");
css.textContent = `
.ns-glow{text-shadow:0 0 10px currentColor}
.ns-gradient{background:linear-gradient(90deg,#ffb547,#ff5c8a);-webkit-background-clip:text;background-clip:text;color:transparent!important}
.ns-mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.ns-serif{font-family:Georgia,"Times New Roman",serif;font-style:italic}
.m .av,.m .n,#memlist > div[data-user],.me .av{cursor:pointer}
.pcard{padding:0!important;overflow:hidden;max-width:430px;width:100%;max-height:92%;overflow-y:auto}
.pbanner{height:86px}
.pbody{padding:0 20px 20px;margin-top:-36px}
.pav{width:74px;height:74px;border-radius:50%;display:grid;place-items:center;font:800 30px var(--head);color:#10121d;border:4px solid var(--panel)}
.pname{font:800 22px var(--head);margin:8px 0 0;overflow-wrap:anywhere}
.pmeta{color:var(--muted);font-size:14px;margin:2px 0}
.pstatus{margin:10px 0 0;padding:6px 12px;border-radius:999px;background:var(--raised);display:inline-block;font-size:14px}
.psec{font-weight:700;font-size:12px;letter-spacing:.06em;color:var(--muted);margin:16px 0 4px;text-transform:uppercase}
.pbio{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;max-height:170px;overflow-y:auto}
.pbio code{font-family:ui-monospace,Menlo,Consolas,monospace;background:rgba(127,127,160,.22);padding:1px 6px;border-radius:6px}
.pbio a{color:var(--accent);text-decoration:underline}
.prow{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.pbtn{padding:9px 16px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-weight:700}
.pbtn.sec{background:var(--raised);color:var(--text)}
.pf input,.pf textarea{display:block;width:100%;margin:4px 0 8px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
.pf textarea{min-height:90px;resize:vertical}
.pf small{color:var(--muted);font-size:12px}
.psw{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 4px}
.psw button{width:32px;height:32px;border-radius:50%;border:3px solid transparent}
.psw button.on{border-color:var(--text)}
.pst{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.pst button{padding:6px 12px;border-radius:999px;background:var(--raised);color:var(--text);font-weight:600}
.pst button.on{background:var(--accent);color:var(--on-accent)}
.pimg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 8px}
.pimg input[type=file]{flex:1;min-width:0;margin:0;font-size:13px}
.pimg button{padding:6px 12px;border-radius:8px;background:var(--raised);color:var(--text);font-weight:600;font-size:13px}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `<div class="ov" id="pov" style="z-index:48"><div class="dlg pcard" id="pcard" role="dialog" aria-modal="true" aria-label="Profile"></div></div>`);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2600);
}
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s](?:[^*]*[^*\s])?\*|https?:\/\/[^\s<]+)/g;
function fmt(el, text) {
  el.textContent = "";
  (text || "").split(TOKEN).forEach((part) => {
    if (!part) return;
    let n = null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) n = h("strong", "", part.slice(2, -2));
    else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) n = h("code", "", part.slice(1, -1));
    else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) n = h("em", "", part.slice(1, -1));
    else if (/^https?:\/\//.test(part)) {
      const m = part.match(/^(.*?)([.,!?)]*)$/);
      n = h("a", "", m[1]);
      n.href = m[1];
      n.target = "_blank";
      n.rel = "noopener noreferrer";
      el.append(n);
      if (m[2]) el.append(m[2]);
      return;
    }
    el.append(n || part);
  });
}
function setStyle(el, style) {
  el.classList.remove("ns-glow", "ns-gradient", "ns-mono", "ns-serif");
  if (style && style !== "normal") el.classList.add("ns-" + style);
}

export async function uploadImage(kind, file, folder) {
  if (!OK_TYPES[file.type]) throw new Error("Use a PNG, JPG, WEBP, or GIF image.");
  if (file.size > MAX_IMG) throw new Error("That image is bigger than 1 MB.");
  const path = folder + "/" + kind + "-" + Date.now() + "." + OK_TYPES[file.type];
  const { error } = await supabase.storage.from("images").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) throw new Error(/size|exceed/i.test(error.message) ? "That image is bigger than 1 MB." : "Could not upload that image.");
  return supabase.storage.from("images").getPublicUrl(path).data.publicUrl;
}
export async function removeByUrl(url) {
  if (!url) return;
  const i = url.indexOf("/object/public/images/");
  if (i < 0) return;
  try { await supabase.storage.from("images").remove([decodeURIComponent(url.slice(i + 22))]); } catch (e) { /* ignore */ }
}
function fillAv(el, p) {
  if (!el) return;
  if (p && p.avatar_url) {
    el.style.backgroundImage = 'url("' + p.avatar_url + '")';
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.style.color = "transparent";
  } else {
    el.style.backgroundImage = "";
    el.style.color = "";
  }
}
function setBanner(el, url, color) {
  el.style.background = url ? 'center / cover no-repeat url("' + url + '")' : "linear-gradient(135deg," + (color || "#ffb547") + ",#12142a)";
}

supabase.auth.getSession().then(({ data }) => { uid = data.session ? data.session.user.id : null; });
supabase.auth.onAuthStateChange((_e, s) => { uid = s && s.user ? s.user.id : null; });

async function loadProfiles(ids) {
  const need = [...new Set(ids)].filter((i) => i && !P[i]);
  if (!need.length) return;
  const { data } = await supabase.from("profiles").select(COLS_SEL).in("id", need);
  (data || []).forEach((r) => (P[r.id] = r));
}
async function getProfile(id) {
  if (!P[id]) await loadProfiles([id]);
  return P[id] || null;
}
function applyNames(root) {
  const list = root.matches && root.matches(".m[data-user]") ? [root] : [...(root.querySelectorAll ? root.querySelectorAll(".m[data-user]") : [])];
  list.forEach((m) => {
    const p = P[m.dataset.user];
    const n = m.querySelector(".n");
    if (p && n) setStyle(n, p.name_style);
    if (p) fillAv(m.querySelector(".av"), p);
  });
}
new MutationObserver(async () => {
  const rows = [...$("memlist").querySelectorAll(":scope > div[data-user]")];
  await loadProfiles(rows.map((r) => r.dataset.user));
  rows.forEach((r) => fillAv(r.querySelector(".av"), P[r.dataset.user]));
}).observe($("memlist"), { childList: true });
function paintOwn() {
  const el = document.querySelector(".me .av");
  const p = uid && P[uid];
  if (el && p && p.avatar_url && !el.style.backgroundImage) fillAv(el, p);
  if (el && p && !p.avatar_url && el.style.backgroundImage) fillAv(el, p);
}
setInterval(async () => { if (uid) { await loadProfiles([uid]); paintOwn(); } }, 2000);
new MutationObserver(async (muts) => {
  const els = [];
  muts.forEach((mu) => mu.addedNodes.forEach((n) => {
    if (n.nodeType === 1 && n.classList.contains("m") && n.dataset.user) els.push(n);
  }));
  if (!els.length) return;
  await loadProfiles(els.map((e) => e.dataset.user));
  els.forEach(applyNames);
}).observe($("msgs"), { childList: true });

function close() { $("pov").classList.remove("on"); }
$("pov").onclick = (e) => { if (e.target === $("pov")) close(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

function header(p) {
  const c = $("pcard");
  c.textContent = "";
  const b = h("div", "pbanner");
  setBanner(b, p.banner_url, p.banner);
  const body = h("div", "pbody");
  const av = h("div", "pav", (p.username || "?")[0].toUpperCase());
  av.style.background = p.color || "#ffb547";
  fillAv(av, p);
  c.append(b, body);
  body.append(av);
  return body;
}
async function openCard(id) {
  const p = await getProfile(id);
  if (!p) return toast("Could not load that profile.");
  view(p);
  $("pov").classList.add("on");
}
function view(p) {
  const body = header(p);
  const name = h("div", "pname", p.username);
  setStyle(name, p.name_style);
  body.append(name);
  const meta = [];
  if (p.pronouns) meta.push(p.pronouns);
  if (p.created_at) meta.push("Joined " + new Date(p.created_at).toLocaleDateString([], { month: "long", year: "numeric" }));
  if (meta.length) body.append(h("div", "pmeta", meta.join(" · ")));
  if (p.status) body.append(h("div", "pstatus", p.status));
  if (p.bio) {
    body.append(h("div", "psec", "About me"));
    const bio = h("div", "pbio");
    fmt(bio, p.bio);
    body.append(bio);
  }
  const row = h("div", "prow");
  if (p.id === uid) {
    const e = h("button", "pbtn", "Edit profile");
    e.onclick = () => edit(p);
    row.append(e);
  } else {
    const m = h("button", "pbtn", "Message");
    m.onclick = () => {
      const b = document.querySelector('#memlist > div[data-user="' + p.id + '"] .mdm');
      if (b) { close(); b.click(); } else toast("Open a server you both belong to, then try again.");
    };
    row.append(m);
  }
  const x = h("button", "pbtn sec", "Close");
  x.onclick = close;
  row.append(x);
  body.append(row);
}
function edit(p) {
  const body = header(p);
  body.classList.add("pf");
  let banner = p.banner || "#ffb547";
  let style = p.name_style || "normal";
  let avFile = null, bnFile = null, avClear = false, bnClear = false;
  const picker = (label, onPick, onClear) => {
    body.append(h("div", "psec", label));
    const row = h("div", "pimg");
    const f = h("input");
    f.type = "file";
    f.accept = "image/png,image/jpeg,image/webp,image/gif";
    f.onchange = () => {
      const file = f.files[0];
      if (!file) return;
      if (file.size > MAX_IMG) { f.value = ""; return toast("That image is bigger than 1 MB."); }
      if (!OK_TYPES[file.type]) { f.value = ""; return toast("Use a PNG, JPG, WEBP, or GIF image."); }
      onPick(file);
    };
    const r = h("button", "", "Remove");
    r.onclick = () => { f.value = ""; onClear(); };
    row.append(f, r);
    body.append(row, h("small", "", "PNG, JPG, WEBP, or GIF. Up to 1 MB."));
  };
  picker("Profile picture",
    (file) => { avFile = file; avClear = false; fillAv($("pcard").querySelector(".pav"), { avatar_url: URL.createObjectURL(file) }); },
    () => { avFile = null; avClear = true; fillAv($("pcard").querySelector(".pav"), null); });
  picker("Profile banner image",
    (file) => { bnFile = file; bnClear = false; setBanner($("pcard").querySelector(".pbanner"), URL.createObjectURL(file), banner); },
    () => { bnFile = null; bnClear = true; setBanner($("pcard").querySelector(".pbanner"), null, banner); });
  body.append(h("div", "psec", "Status"));
  const st = h("input");
  st.maxLength = 60;
  st.placeholder = "😀 What are you up to?";
  st.value = p.status || "";
  body.append(st);
  body.append(h("div", "psec", "Pronouns"));
  const pr = h("input");
  pr.maxLength = 20;
  pr.placeholder = "for example: she/her";
  pr.value = p.pronouns || "";
  body.append(pr);
  body.append(h("div", "psec", "About me"));
  const bio = h("textarea");
  bio.maxLength = 300;
  bio.placeholder = "Tell people about yourself. You can use **bold**, *italic*, and `code`.";
  bio.value = p.bio || "";
  const cnt = h("small", "", "");
  const upd = () => { cnt.textContent = bio.value.length + "/300. Do not share your phone number, address, school, or other private details. Everyone on Rally can see this."; };
  bio.oninput = upd;
  upd();
  body.append(bio, cnt);
  body.append(h("div", "psec", "Banner color"));
  const sw = h("div", "psw");
  COLS.forEach((c) => {
    const b = h("button");
    b.style.background = c;
    b.setAttribute("aria-label", "Banner " + c);
    if (c === banner) b.className = "on";
    b.onclick = () => {
      banner = c;
      sw.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      if (!bnFile && (bnClear || !p.banner_url)) setBanner($("pcard").querySelector(".pbanner"), null, c);
    };
    sw.append(b);
  });
  body.append(sw);
  body.append(h("div", "psec", "Name style"));
  const nm = h("div", "pname", p.username);
  setStyle(nm, style);
  const pills = h("div", "pst");
  STYLES.forEach(([k, label]) => {
    const b = h("button", k === style ? "on" : "", label);
    b.onclick = () => {
      style = k;
      pills.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      setStyle(nm, k);
    };
    pills.append(b);
  });
  body.append(pills, nm);
  const row = h("div", "prow");
  const save = h("button", "pbtn", "Save profile");
  save.onclick = async () => {
    save.disabled = true;
    let avatar_url = p.avatar_url || null, banner_url = p.banner_url || null;
    const oldAv = avatar_url, oldBn = banner_url;
    try {
      if (avClear) avatar_url = null;
      if (bnClear) banner_url = null;
      if (avFile) avatar_url = await uploadImage("avatar", avFile, "users/" + uid);
      if (bnFile) banner_url = await uploadImage("banner", bnFile, "users/" + uid);
    } catch (err) {
      save.disabled = false;
      return toast(err.message);
    }
    const { data, error } = await supabase
      .from("profiles")
      .update({ status: st.value.trim() || null, pronouns: pr.value.trim() || null, bio: bio.value.trim() || null, banner, name_style: style, avatar_url, banner_url })
      .eq("id", uid)
      .select(COLS_SEL)
      .single();
    save.disabled = false;
    if (error || !data) return toast("Could not save your profile. Is the profile SQL run?");
    P[uid] = data;
    if (oldAv && oldAv !== data.avatar_url) removeByUrl(oldAv);
    if (oldBn && oldBn !== data.banner_url) removeByUrl(oldBn);
    paintOwn();
    document.querySelectorAll('.m[data-user="' + uid + '"]').forEach(applyNames);
    toast("Profile saved.");
    view(data);
  };
  const cancel = h("button", "pbtn sec", "Cancel");
  cancel.onclick = () => view(p);
  row.append(save, cancel);
  body.append(row);
}

document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (t.closest("button, a, input, textarea, select, .mact, #pov")) return;
  const msg = t.closest(".m[data-user]");
  if (msg && (t.closest(".av") || t.closest(".n"))) return openCard(msg.dataset.user);
  const row = t.closest("#memlist > div[data-user]");
  if (row) return openCard(row.dataset.user);
  if (t.closest(".me") && t.closest(".av") && uid) return openCard(uid);
});