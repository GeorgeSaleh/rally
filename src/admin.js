import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
let openCount = 0, countGid = null, countAt = 0;

const css = document.createElement("style");
css.textContent = `
.ban-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)}
.ban-row span{flex:1;overflow-wrap:anywhere}
.ban-row button{padding:5px 12px;border-radius:8px;background:var(--accent);color:var(--on-accent);font-weight:600}
.cbadge{font-style:normal;float:right;color:var(--pink);font-weight:700}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="banov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="bant">
  <h2 id="bant">Banned people</h2>
  <p class="sub">Unbanning lets someone join again with the invite code.</p>
  <div id="banlist"></div>
  <div class="row"><button class="cancel" id="banclose">Close</button></div>
</div></div>`);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2400);
}
function repBtn() {
  return [...$("chs").querySelectorAll("button")].find((b) => b.textContent.startsWith("Reports"));
}
function paint() {
  const b = repBtn();
  if (!b) return;
  b.textContent = "Reports";
  if (openCount) {
    const i = document.createElement("i");
    i.className = "cbadge";
    i.textContent = String(openCount);
    b.append(i);
  }
}
async function refreshCount() {
  const gid = R().gid;
  if (!gid) return;
  countGid = gid;
  countAt = Date.now();
  const { count } = await supabase.from("reports").select("id", { count: "exact", head: true }).eq("group_id", gid).eq("status", "open");
  openCount = count || 0;
  paint();
}
function enhanceChans() {
  const r = R();
  if (r.role !== "admin" || !r.gid) return;
  const rep = repBtn();
  if (!rep) return;
  if (![...$("chs").querySelectorAll("button")].some((b) => b.dataset.ban)) {
    const b = document.createElement("button");
    b.className = "ch";
    b.dataset.ban = "1";
    b.textContent = "Banned people";
    b.onclick = openBans;
    rep.after(b);
  }
  if (countGid !== r.gid || Date.now() - countAt > 15000) refreshCount();
  else paint();
}
new MutationObserver(enhanceChans).observe($("chs"), { childList: true });

async function openBans() {
  $("banov").classList.add("on");
  const box = $("banlist");
  box.textContent = "Loading...";
  const { data, error } = await supabase.rpc("list_bans", { p_group: R().gid });
  box.textContent = "";
  if (error) { box.textContent = "Could not load the ban list."; return; }
  if (!data.length) { box.textContent = "Nobody is banned."; return; }
  data.forEach((b) => {
    const row = document.createElement("div");
    row.className = "ban-row";
    const n = document.createElement("span");
    n.textContent = b.username || "Deleted account";
    const u = document.createElement("button");
    u.textContent = "Unban";
    u.onclick = async () => {
      const { error: e2 } = await supabase.rpc("unban_user", { p_group: R().gid, p_user: b.user_id });
      if (e2) return toast("Could not unban.");
      row.remove();
      toast("Unbanned.");
    };
    row.append(n, u);
    box.append(row);
  });
}
$("banclose").onclick = () => $("banov").classList.remove("on");
$("banov").onclick = (e) => { if (e.target === $("banov")) $("banov").classList.remove("on"); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("banov").classList.remove("on"); });

function addRoleButtons() {
  const r = R();
  if (r.role !== "admin" || !r.gid) return;
  document.querySelectorAll("#memlist > div[data-user] .mact").forEach((box) => {
    if (box.querySelector(".mrole")) return;
    const row = box.parentElement;
    const isAdm = !!row.querySelector("small");
    const nameNode = [...row.childNodes].find((n) => n.nodeType === 3);
    const who = nameNode ? nameNode.nodeValue : "this person";
    const b = document.createElement("button");
    b.className = "mb mrole";
    b.textContent = isAdm ? "Remove admin" : "Make admin";
    b.onclick = async () => {
      if (!confirm((isAdm ? "Remove admin rights from " : "Make an admin: ") + who + "?")) return;
      const { error } = await supabase.rpc("set_member_role", { p_group: r.gid, p_user: row.dataset.user, p_role: isAdm ? "member" : "admin" });
      if (error) return toast(error.message.includes("creator") ? "Only the group creator can remove admins." : "Could not change that role.");
      await R().refresh();
      toast(isAdm ? "Admin rights removed." : "They are now an admin.");
    };
    box.append(b);
  });
}
new MutationObserver(addRoleButtons).observe($("memlist"), { childList: true });

supabase.auth.getSession().then(() => {
  supabase
    .channel("reports-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => refreshCount())
    .subscribe();
});