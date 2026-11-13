import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
let rank = "none"; // Rally-wide rank: "owner", "admin" or "none"
let lastUser = null;

const css = document.createElement("style");
css.textContent = `
#memlist .mact{flex-wrap:wrap;margin-left:12px;margin-right:8px}
#memlist .mact .mb{white-space:nowrap}
#memlist .mact .rmt-red:hover,.rmt-card .rmt-red:hover{background:var(--pink);color:#fff}
.rmt-card{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.rmt-card .pbtn{padding:7px 14px;font-size:13px}`;
document.head.append(css);

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2800);
}

function why(m, fallback) {
  if (m.includes("outranks")) return "That person outranks you.";
  if (m.includes("Only admins") || m.includes("Only Rally")) return "You do not have permission for that.";
  if (m.includes("an admin")) return "Only a Rally admin can do that to a server admin.";
  if (m.includes("Too long")) return "The longest timeout is 7 days.";
  return fallback;
}

async function doTimeout(uid, name) {
  const raw = prompt("Timeout " + name + " for how many minutes? (1 to 10080). Type 0 to lift a timeout.", "10");
  if (raw === null) return;
  const mins = parseInt(raw, 10);
  if (Number.isNaN(mins) || mins < 0) return toast("Type a number of minutes.");
  const { error } = await supabase.rpc("timeout_member", { p_group: R().gid, p_user: uid, p_minutes: mins });
  if (error) return toast(why(error.message, "Could not do that."));
  toast(mins > 0 ? name + " is timed out for " + mins + " minutes." : "Timeout lifted.");
}

async function doDemote(uid, name) {
  if (!confirm("Take away " + name + "'s admin powers in this server? They stay as a normal member.")) return;
  const { error } = await supabase.rpc("demote_admin", { p_group: R().gid, p_user: uid });
  if (error) return toast(why(error.message, "Could not demote."));
  toast(name + " is now a normal member.");
  if (R().refresh) R().refresh();
}

async function doBan(uid, name) {
  if (!confirm("Permanently ban " + name + "'s ACCOUNT from all of Rally? They will not be able to log in or send anything.")) return;
  const reason = prompt("Reason (only Rally admins can see this):", "");
  if (reason === null) return;
  const { error } = await supabase.rpc("ban_account", { p_user: uid, p_reason: reason });
  if (error) return toast(why(error.message, "Could not ban that account. Did you run the SQL?"));
  toast(name + "'s account is banned.");
}

// Which buttons this person may use on that member
function actionsFor(uid, name, isGroupAdmin, inList) {
  const staff = rank !== "none";
  const out = [];
  if (inList && ((R().role === "admin" && !isGroupAdmin) || staff)) out.push(["Timeout", false, () => doTimeout(uid, name)]);
  if (inList && staff && isGroupAdmin) out.push(["Demote", false, () => doDemote(uid, name)]);
  if (staff) out.push(["Ban account", true, () => doBan(uid, name)]);
  return out;
}

// Finds the username text in a member row (skips avatar, buttons, badges, tags)
function nameOf(row) {
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    if (n.parentElement.closest("button, .mact, .rbdg-wrap, .av, small")) continue;
    return n.textContent.trim().slice(0, 30);
  }
  return "this person";
}

// ---- Buttons in the member list ----
function addButtons() {
  $("memlist").querySelectorAll(":scope > div[data-user]").forEach((row) => {
    const box = row.querySelector(".mact");
    if (!box || box.querySelector(".rmt")) return;
    const small = row.querySelector("small");
    const isGroupAdmin = !!(small && small.textContent.trim() === "admin");
    const name = nameOf(row);
    actionsFor(row.dataset.user, name, isGroupAdmin, true).forEach(([label, red, fn]) => {
      const b = document.createElement("button");
      b.className = "mb rmt" + (red ? " rmt-red" : "");
      b.textContent = label;
      b.onclick = fn;
      box.append(b);
    });
  });
}

// ---- Buttons in the profile popup (second way to reach them) ----
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element) || t.closest("button")) return;
  const el = t.closest(".m[data-user], #memlist > div[data-user]");
  if (el) lastUser = el.dataset.user;
}, true);

function cardTools() {
  const card = $("pcard");
  if (!card || card.querySelector(".pf") || card.querySelector(".rmt-card")) return;
  const row = card.querySelector(".prow");
  const nm = card.querySelector(".pname");
  if (!row || !nm || !lastUser || lastUser === R().uid) return;
  const memRow = $("memlist").querySelector(':scope > div[data-user="' + lastUser + '"]');
  const small = memRow && memRow.querySelector("small");
  const isGroupAdmin = !!(small && small.textContent.trim() === "admin");
  const acts = actionsFor(lastUser, nm.textContent.trim(), isGroupAdmin, !!memRow);
  if (!acts.length) return;
  const box = document.createElement("div");
  box.className = "rmt-card";
  acts.forEach(([label, red, fn]) => {
    const b = document.createElement("button");
    b.className = "pbtn sec rmt" + (red ? " rmt-red" : "");
    b.textContent = label;
    b.onclick = fn;
    box.append(b);
  });
  row.after(box);
}
new MutationObserver(() => setTimeout(cardTools, 0)).observe($("pcard"), { childList: true });

// ---- Rank ----
async function checkRank() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { rank = "none"; return; }
  const { data: r, error } = await supabase.rpc("my_rank");
  rank = !error && (r === "owner" || r === "admin") ? r : "none";
  console.log("[modtools] ready. Your Rally rank:", rank, "| server role:", R().role);
  document.querySelectorAll(".rmt, .rmt-card").forEach((b) => b.remove());
  addButtons();
}
supabase.auth.onAuthStateChange(() => { setTimeout(checkRank, 0); });
checkRank();

new MutationObserver(addButtons).observe($("memlist"), { childList: true, subtree: true });
setInterval(addButtons, 3000);