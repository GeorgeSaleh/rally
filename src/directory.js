import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
let uid = null, mine = new Set(), timer = null;

const css = document.createElement("style");
css.textContent = `
.dirbtn{display:block;width:calc(100% - 16px);margin:6px 8px;text-align:left;padding:9px 12px;border-radius:10px;background:var(--raised);color:var(--text);font-weight:600}
.dirwarn{font-size:13px;color:var(--muted);background:var(--raised);border-left:3px solid var(--pink);padding:8px 12px;border-radius:8px;margin:0 0 12px}
.dircard{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--line);border-radius:14px;margin-bottom:10px;background:var(--raised)}
.dircard .info{flex:1;min-width:0}
.dircard b{display:block;font:800 16px var(--head);overflow-wrap:anywhere}
.dircard p{margin:2px 0;color:var(--muted);font-size:14px;overflow-wrap:anywhere}
.dircard small{color:var(--muted)}
.dircard button{padding:8px 16px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700}
.dircard button.open{background:var(--panel);color:var(--text)}
.dirq{width:100%;margin:0 0 12px;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="dirov" style="z-index:46"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dirt" style="max-width:520px;max-height:92%;overflow-y:auto">
  <h2 id="dirt">Discover servers</h2>
  <p class="dirwarn">Public servers are open to everyone on Rally. Only join servers you trust. Private messages only work between people who share a private server.</p>
  <input class="dirq" id="dirq" placeholder="Search public servers" autocomplete="off">
  <div id="dirlist"></div>
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

const btn = document.createElement("button");
btn.className = "dirbtn";
btn.textContent = "🧭 Discover servers";
document.querySelector(".side .code").after(btn);
btn.onclick = () => { $("dirov").classList.add("on"); load(); $("dirq").focus(); };
$("dirclose").onclick = () => $("dirov").classList.remove("on");
$("dirov").onclick = (e) => { if (e.target === $("dirov")) $("dirov").classList.remove("on"); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("dirov").classList.remove("on"); });
$("dirq").oninput = () => { clearTimeout(timer); timer = setTimeout(load, 300); };

async function load() {
  const list = $("dirlist");
  list.textContent = "Loading...";
  const q = $("dirq").value.trim();
  const [res, mem] = await Promise.all([
    supabase.rpc("list_public_groups", { p_search: q || null }),
    uid ? supabase.from("group_members").select("group_id").eq("user_id", uid) : Promise.resolve({ data: [] }),
  ]);
  mine = new Set((mem.data || []).map((x) => x.group_id));
  list.textContent = "";
  if (res.error) { list.textContent = "Could not load the directory. Is the directory SQL run?"; return; }
  if (!res.data.length) { list.textContent = q ? "No public servers match that search." : "No public servers yet. Make yours public in Server settings."; return; }
  res.data.forEach((g) => {
    const card = document.createElement("div");
    card.className = "dircard";
    const info = document.createElement("div");
    info.className = "info";
    const n = document.createElement("b");
    n.textContent = g.name;
    const d = document.createElement("p");
    d.textContent = g.description || "No description yet.";
    const c = document.createElement("small");
    c.textContent = g.member_count + (Number(g.member_count) === 1 ? " member" : " members");
    info.append(n, d, c);
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
      if (R().reload) await R().reload(g.id);
      else location.reload();
    };
    card.append(info, b);
    list.append(card);
  });
}

const gs = $("gsov");
if (gs) {
  const dz = [...gs.querySelectorAll(".gh")].find((x) => x.textContent === "Danger zone");
  const sec = document.createElement("div");
  sec.innerHTML = `
    <h3 class="gh">Public listing</h3>
    <p class="sub">Public servers appear in the directory, and anyone on Rally can join without an invite code. People who only share a public server cannot send each other private messages. Only the server's creator can change this.</p>
    <label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="pub-on"> List this server publicly</label>
    <textarea class="gtx" id="pub-desc" maxlength="200" placeholder="Describe your server in a sentence or two..." style="min-height:70px"></textarea>
    <button class="gbtn" id="pub-save">Save listing</button>
    <p class="gmsg2" id="pub-msg" role="status"></p>`;
  if (dz) dz.before(sec); else $("gs-close").before(sec);
  const say = (t, ok) => { const m = $("pub-msg"); m.textContent = t; m.style.color = ok ? "var(--accent)" : "var(--pink)"; };
  async function loadPub() {
    say("");
    const { data } = await supabase.from("groups").select("is_public,description").eq("id", R().gid).maybeSingle();
    $("pub-on").checked = !!(data && data.is_public);
    $("pub-desc").value = (data && data.description) || "";
  }
  new MutationObserver(() => { if (gs.classList.contains("on")) loadPub(); }).observe(gs, { attributes: true, attributeFilter: ["class"] });
  $("pub-save").onclick = async () => {
    const on = $("pub-on").checked;
    if (on && !confirm("Make this server public? Anyone on Rally will be able to find it, see who is in it, and join without an invite code. Your invite code keeps working too.")) return;
    const { error } = await supabase.rpc("set_group_public", { p_group: R().gid, p_public: on, p_description: $("pub-desc").value });
    if (error) return say(error.message.includes("creator") ? "Only the person who created this server can change this." : "Could not save the listing.");
    say(on ? "Your server is now listed in the directory." : "Your server is private again.", true);
  };
}