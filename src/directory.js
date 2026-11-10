import { supabase } from "./supabase.js";
import { uploadImage, removeByUrl, MAX_IMG } from "./profiles.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
const OK = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const GRADS = ["#ffb547", "#ff5c8a", "#7fd6ff", "#b69cff", "#8be28b", "#ff8a5c", "#5c7cff", "#2dd4bf"];
let uid = null, mine = new Set(), icons = {};

const css = document.createElement("style");
css.textContent = `
.grp.disc{background:var(--raised);font-size:22px}
.grp.disc:hover{background:#4f5bd5;color:#fff}
.dirwarn{font-size:13px;color:var(--muted);background:var(--raised);border-left:3px solid var(--pink);padding:8px 12px;border-radius:8px;margin:0 0 14px}
.dirgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.dcard{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--raised);display:flex;flex-direction:column}
.dbanner{height:80px;background-size:cover;background-position:center}
.dbody{padding:0 14px 14px;margin-top:-26px;display:flex;flex-direction:column;flex:1}
.dicon{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font:800 20px var(--head);color:#10121d;border:3px solid var(--raised);background-size:cover;background-position:center}
.dcard b{display:block;font:800 16px var(--head);margin-top:8px;overflow-wrap:anywhere}
.dcard p{margin:4px 0;color:var(--muted);font-size:14px;overflow-wrap:anywhere;flex:1}
.dcard small{color:var(--muted)}
.dcard button{margin-top:10px;padding:8px 16px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700}
.dcard button.open{background:var(--panel);color:var(--text)}
.simg{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 10px}
.simg .th{width:44px;height:44px;border-radius:12px;background:var(--raised) center/cover;flex:none}
.simg input[type=file]{flex:1;min-width:0;font-size:13px}
.simg button{padding:6px 12px;border-radius:8px;background:var(--raised);color:var(--text);font-weight:600;font-size:13px}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="dirov" style="z-index:46"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dirt" style="max-width:920px;max-height:92%;overflow-y:auto">
  <h2 id="dirt">Discover servers</h2>
  <p class="dirwarn">Public servers are open to everyone on Rally. Only join servers you trust. Private messages only work between people who share a private server.</p>
  <div class="dirgrid" id="dirlist"></div>
  <div class="row"><button class="cancel" id="dirclose">Close</button></div>
</div></div>`);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2800);
}
supabase.auth.getSession().then(({ data }) => { uid = data.session ? data.session.user.id : null; });
supabase.auth.onAuthStateChange((_e, s) => { uid = s && s.user ? s.user.id : null; });

function openDir() { $("dirov").classList.add("on"); load(); }
$("dirclose").onclick = () => $("dirov").classList.remove("on");
$("dirov").onclick = (e) => { if (e.target === $("dirov")) $("dirov").classList.remove("on"); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("dirov").classList.remove("on"); });

async function loadIcons() {
  const { data } = await supabase.from("groups").select("id,icon_url,banner_url");
  icons = {};
  (data || []).forEach((g) => (icons[g.id] = g));
}
async function applyIcons() {
  const btns = [...$("rail").querySelectorAll(".grp[data-gid]")];
  if (!btns.length) return;
  if (btns.some((b) => !(b.dataset.gid in icons))) await loadIcons();
  btns.forEach((b) => {
    const g = icons[b.dataset.gid];
    if (g && g.icon_url) {
      b.style.setProperty("background-image", 'url("' + g.icon_url + '")', "important");
      b.style.backgroundSize = "cover";
      b.style.backgroundPosition = "center";
      b.style.color = "transparent";
    }
  });
}
function enhanceRail() {
  const rail = $("rail");
  if (!rail.querySelector(".grp.disc")) {
    const b = document.createElement("button");
    b.className = "grp disc";
    b.textContent = "🧭";
    b.title = "Discover servers";
    b.setAttribute("aria-label", "Discover servers");
    b.onclick = openDir;
    const add = rail.querySelector(".grp.add");
    if (add) add.after(b); else rail.append(b);
  }
  applyIcons();
}
new MutationObserver(enhanceRail).observe($("rail"), { childList: true });
enhanceRail();

async function load() {
  const list = $("dirlist");
  list.textContent = "Loading...";
  const [res, mem] = await Promise.all([
    supabase.rpc("list_public_groups", { p_search: null }),
    uid ? supabase.from("group_members").select("group_id").eq("user_id", uid) : Promise.resolve({ data: [] }),
  ]);
  mine = new Set((mem.data || []).map((x) => x.group_id));
  list.textContent = "";
  if (res.error) { list.textContent = "Could not load the directory. Is the directory SQL run?"; return; }
  if (!res.data.length) { list.textContent = "No public servers yet. The creator of a server can list it in Server settings."; return; }
  res.data.forEach((g, i) => {
    const card = document.createElement("div");
    card.className = "dcard";
    const ban = document.createElement("div");
    ban.className = "dbanner";
    ban.style.background = g.banner_url ? 'center / cover no-repeat url("' + g.banner_url + '")' : "linear-gradient(135deg," + GRADS[i % GRADS.length] + ",#12142a)";
    const body = document.createElement("div");
    body.className = "dbody";
    const ic = document.createElement("div");
    ic.className = "dicon";
    ic.textContent = g.name[0].toUpperCase();
    ic.style.background = GRADS[(i + 3) % GRADS.length];
    if (g.icon_url) { ic.style.backgroundImage = 'url("' + g.icon_url + '")'; ic.style.color = "transparent"; }
    const n = document.createElement("b");
    n.textContent = g.name;
    const d = document.createElement("p");
    d.textContent = g.description || "No description yet.";
    const c = document.createElement("small");
    c.textContent = g.member_count + (Number(g.member_count) === 1 ? " member" : " members");
    const b = document.createElement("button");
    const joined = mine.has(g.id);
    b.textContent = joined ? "Open" : "Join";
    if (joined) b.className = "open";
    b.onclick = async () => {
      if (!joined) {
        b.disabled = true;
        const { error } = await supabase.rpc("join_public_group", { p_group: g.id });
        b.disabled = false;
        if (error) {
          return toast(error.message.includes("banned") ? "You are banned from that server." : error.message.includes("Too many") ? "You joined several servers recently. Try again later." : "Could not join that server.");
        }
        toast("Welcome to " + g.name + "!");
      }
      $("dirov").classList.remove("on");
      icons = {};
      if (R().reload) await R().reload(g.id);
      else location.reload();
    };
    body.append(ic, n, d, c, b);
    card.append(ban, body);
    list.append(card);
  });
}

const gs = $("gsov");
if (gs) {
  const dz = [...gs.querySelectorAll(".gh")].find((x) => x.textContent === "Danger zone");
  const sec = document.createElement("div");
  sec.innerHTML = `
    <h3 class="gh">Server images</h3>
    <p class="sub">PNG, JPG, WEBP, or GIF, up to 1 MB each. Admins can change these.</p>
    <div class="simg"><div class="th" id="img-icon-th"></div><span>Icon</span><input type="file" id="img-icon" accept="image/png,image/jpeg,image/webp,image/gif"><button id="img-icon-rm">Remove</button></div>
    <div class="simg"><div class="th" id="img-banner-th"></div><span>Banner</span><input type="file" id="img-banner" accept="image/png,image/jpeg,image/webp,image/gif"><button id="img-banner-rm">Remove</button></div>
    <h3 class="gh">Public listing</h3>
    <p class="sub">Public servers appear in Discover, and anyone on Rally can join without an invite code. People who only share a public server cannot send each other private messages. Only the server's creator can change this.</p>
    <label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="pub-on"> List this server publicly</label>
    <textarea class="gtx" id="pub-desc" maxlength="200" placeholder="Describe your server in a sentence or two..." style="min-height:70px"></textarea>
    <button class="gbtn" id="pub-save">Save listing</button>
    <p class="gmsg2" id="pub-msg" role="status"></p>`;
  if (dz) dz.before(sec); else $("gs-close").before(sec);
  const say = (t, ok) => { const m = $("pub-msg"); m.textContent = t; m.style.color = ok ? "var(--accent)" : "var(--pink)"; };
  function thumbs(g) {
    $("img-icon-th").style.backgroundImage = g && g.icon_url ? 'url("' + g.icon_url + '")' : "";
    $("img-banner-th").style.backgroundImage = g && g.banner_url ? 'url("' + g.banner_url + '")' : "";
  }
  async function loadPub() {
    say("");
    const { data } = await supabase.from("groups").select("is_public,description,icon_url,banner_url").eq("id", R().gid).maybeSingle();
    $("pub-on").checked = !!(data && data.is_public);
    $("pub-desc").value = (data && data.description) || "";
    thumbs(data);
  }
  new MutationObserver(() => { if (gs.classList.contains("on")) loadPub(); }).observe(gs, { attributes: true, attributeFilter: ["class"] });
  async function setImage(kind, file) {
    const gid = R().gid;
    if (!gid) return;
    const col = kind === "icon" ? "icon_url" : "banner_url";
    const { data: cur } = await supabase.from("groups").select("icon_url,banner_url").eq("id", gid).maybeSingle();
    let url = null;
    if (file) {
      if (!OK.includes(file.type)) return say("Use a PNG, JPG, WEBP, or GIF image.");
      if (file.size > MAX_IMG) return say("That image is bigger than 1 MB.");
      try { url = await uploadImage(kind, file, "servers/" + gid); } catch (e) { return say(e.message); }
    }
    const { error } = await supabase.rpc("set_group_image", { p_group: gid, p_kind: kind, p_url: url });
    if (error) return say("Could not save that image. Only admins can change server images.");
    if (cur && cur[col] && cur[col] !== url) removeByUrl(cur[col]);
    say(file ? "Image saved." : "Image removed.", true);
    icons = {};
    loadPub();
    if (R().reload) R().reload(gid);
  }
  $("img-icon").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) setImage("icon", f); };
  $("img-banner").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) setImage("banner", f); };
  $("img-icon-rm").onclick = () => setImage("icon", null);
  $("img-banner-rm").onclick = () => setImage("banner", null);
  $("pub-save").onclick = async () => {
    const on = $("pub-on").checked;
    if (on && !confirm("Make this server public? Anyone on Rally will be able to find it, see who is in it, and join without an invite code. Your invite code keeps working too.")) return;
    const { error } = await supabase.rpc("set_group_public", { p_group: R().gid, p_public: on, p_description: $("pub-desc").value });
    if (error) return say(error.message.includes("creator") ? "Only the person who created this server can change this." : "Could not save the listing.");
    say(on ? "Your server is now listed in Discover." : "Your server is private again.", true);
  };
}