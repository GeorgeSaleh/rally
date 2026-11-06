import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};

const css = document.createElement("style");
css.textContent = `
.gsdlg{max-height:92%;overflow-y:auto}
.gsdlg .gh{margin:16px 0 6px;font:800 15px var(--head)}
.gsdlg .gtx{display:block;width:100%;margin:6px 0 10px;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
.gsdlg .gbtn{padding:9px 16px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-weight:700}
.gsdlg .gbtn.red{background:var(--pink);color:#fff}
.gs-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)}
.gs-row span{flex:1;overflow-wrap:anywhere}
.gs-row button{padding:4px 10px;border-radius:8px;background:var(--raised);color:var(--text);font-size:13px;font-weight:600}
.gs-row button.red:hover{background:var(--pink);color:#fff}
.gmsg2{min-height:20px;font-size:14px;margin:10px 0 0}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="gsov"><div class="dlg gsdlg" role="dialog" aria-modal="true" aria-labelledby="gst" style="max-width:460px">
  <h2 id="gst">Server settings</h2>
  <h3 class="gh">Server name</h3>
  <input class="gtx" id="gs-name" maxlength="40" autocomplete="off">
  <button class="gbtn" id="gs-namebtn">Save name</button>
  <h3 class="gh">Channels</h3>
  <div id="gs-chans"></div>
  <h3 class="gh">Danger zone</h3>
  <p class="sub">Deleting a server removes all of its channels, messages, reactions, and reports for everyone. Only the creator can do this.</p>
  <input class="gtx" id="gs-confirm" placeholder="Type the server name to confirm" autocomplete="off">
  <button class="gbtn red" id="gs-del">Delete server</button>
  <p class="gmsg2" id="gs-msg" role="status"></p>
  <div class="row"><button class="cancel" id="gs-close">Close</button></div>
</div></div>`);

function say(t, ok) {
  const m = $("gs-msg");
  m.textContent = t;
  m.style.color = ok ? "var(--accent)" : "var(--pink)";
}
async function reload(sel) {
  const r = R();
  if (r.reload) await r.reload(sel);
  else location.reload();
}
function clean(raw) {
  return (raw || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30);
}
async function loadChans() {
  const box = $("gs-chans");
  box.textContent = "Loading...";
  const { data, error } = await supabase.from("channels").select("id,name").eq("group_id", R().gid).order("created_at");
  box.textContent = "";
  if (error) { box.textContent = "Could not load channels."; return; }
  data.forEach((c) => {
    const row = document.createElement("div");
    row.className = "gs-row";
    const n = document.createElement("span");
    n.textContent = "# " + c.name;
    const rn = document.createElement("button");
    rn.textContent = "Rename";
    rn.onclick = async () => {
      const name = clean(prompt("New channel name (letters, numbers, dashes):", c.name));
      if (!name || name === c.name) return;
      const { error: e } = await supabase.rpc("rename_channel", { p_channel: c.id, p_name: name });
      if (e) return say(e.message.includes("taken") ? "A channel with that name already exists." : "Could not rename that channel.");
      say("Channel renamed.", true);
      await reload(R().gid);
      loadChans();
    };
    const dl = document.createElement("button");
    dl.className = "red";
    dl.textContent = "Delete";
    dl.onclick = async () => {
      if (!confirm("Delete #" + c.name + " and all of its messages? This cannot be undone.")) return;
      const { error: e } = await supabase.rpc("delete_channel", { p_channel: c.id });
      if (e) return say(e.message.includes("Last") ? "A server needs at least one channel." : "Could not delete that channel.");
      say("Channel deleted.", true);
      await reload(R().gid);
      loadChans();
    };
    row.append(n, rn, dl);
    box.append(row);
  });
}
function openSettings() {
  say("");
  $("gs-name").value = $("gname").textContent;
  $("gs-confirm").value = "";
  $("gsov").classList.add("on");
  loadChans();
}
$("gs-namebtn").onclick = async () => {
  const v = $("gs-name").value.trim();
  if (v.length < 2) return say("Server names need at least 2 characters.");
  const { error } = await supabase.rpc("rename_group", { p_group: R().gid, p_name: v });
  if (error) return say("Could not rename the server.");
  say("Server renamed.", true);
  await reload(R().gid);
};
$("gs-del").onclick = async () => {
  const typed = $("gs-confirm").value.trim();
  if (typed !== $("gname").textContent) return say("Type the exact server name to confirm.");
  if (!confirm("Delete " + typed + " for everyone? This cannot be undone.")) return;
  const { error } = await supabase.rpc("delete_group", { p_group: R().gid });
  if (error) return say(error.message.includes("creator") ? "Only the person who created this server can delete it." : "Could not delete the server.");
  $("gsov").classList.remove("on");
  await reload();
};
$("gs-close").onclick = () => $("gsov").classList.remove("on");
$("gsov").onclick = (e) => { if (e.target === $("gsov")) $("gsov").classList.remove("on"); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("gsov").classList.remove("on"); });

function enhance() {
  const r = R();
  if (r.role !== "admin" || !r.gid) return;
  const btns = [...$("chs").querySelectorAll("button")];
  if (btns.some((b) => b.dataset.gs)) return;
  const rep = btns.find((b) => b.textContent.startsWith("Reports"));
  if (!rep) return;
  const b = document.createElement("button");
  b.className = "ch";
  b.dataset.gs = "1";
  b.textContent = "Server settings";
  b.onclick = openSettings;
  rep.before(b);
}
new MutationObserver(enhance).observe($("chs"), { childList: true });