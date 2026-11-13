import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
let owner = false;

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2800);
}

async function checkOwner() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { owner = false; return; }
  const { data: yes } = await supabase.rpc("is_rally_admin");
  owner = yes === true;
  addButtons();
}
supabase.auth.onAuthStateChange(() => { setTimeout(checkOwner, 0); });
checkOwner();

async function doTimeout(uid, name) {
  const raw = prompt("Timeout " + name + " for how many minutes? (1 to 10080). Type 0 to lift a timeout.", "10");
  if (raw === null) return;
  const mins = parseInt(raw, 10);
  if (Number.isNaN(mins) || mins < 0) return toast("Type a number of minutes.");
  const { error } = await supabase.rpc("timeout_member", { p_group: R().gid, p_user: uid, p_minutes: mins });
  if (error) {
    const m = error.message;
    return toast(m.includes("an admin") ? "You cannot timeout an admin." : m.includes("Only admins") ? "Only admins can do that." : m.includes("Too long") ? "The longest timeout is 7 days." : "Could not do that.");
  }
  toast(mins > 0 ? name + " is timed out for " + mins + " minutes." : "Timeout lifted.");
}

async function doBan(uid, name) {
  if (!confirm("Permanently ban " + name + "'s ACCOUNT from all of Rally? They will not be able to log in or send anything.")) return;
  const reason = prompt("Reason (only you can see this):", "");
  if (reason === null) return;
  const { error } = await supabase.rpc("ban_account", { p_user: uid, p_reason: reason });
  if (error) return toast(error.message.includes("Rally admin") ? "You cannot ban a Rally admin." : "Could not ban that account.");
  toast(name + "'s account is banned.");
}

function addButtons() {
  $("memlist").querySelectorAll(":scope > div[data-user]").forEach((row) => {
    const box = row.querySelector(".mact");
    if (!box || box.querySelector(".rmt")) return;
    const uid = row.dataset.user;
    const small = row.querySelector("small");
    const isGroupAdmin = !!(small && small.textContent.trim() === "admin");
    const name = (row.querySelector(".rns") || row).textContent.trim().split("\n")[0].slice(0, 30) || "this person";
    if (R().role === "admin" && !isGroupAdmin) {
      const t = document.createElement("button");
      t.className = "mb rmt";
      t.textContent = "Timeout";
      t.onclick = () => doTimeout(uid, name);
      box.append(t);
    }
    if (owner) {
      const b = document.createElement("button");
      b.className = "mb rmt";
      b.textContent = "Ban account";
      b.onclick = () => doBan(uid, name);
      box.append(b);
    }
  });
}
new MutationObserver(addButtons).observe($("memlist"), { childList: true });