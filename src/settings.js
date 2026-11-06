import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const COL = ["#ffb547", "#ff5c8a", "#7fd6ff", "#b69cff", "#8be28b"];
let user = null;

const css = document.createElement("style");
css.textContent = `
.gear{font-size:18px;margin-left:auto;color:var(--muted)}
.gear:hover{color:var(--text)}
.sdlg{max-height:92%;overflow-y:auto}
.sdlg .sh{margin:16px 0 6px;font:800 15px var(--head)}
.sdlg input.tx{display:block;width:100%;margin:6px 0 10px;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
.sdlg .sbtn{padding:10px 16px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-weight:700}
.sdlg .sbtn.red{background:var(--pink);color:#fff}
.sw{display:flex;gap:10px;flex-wrap:wrap}
.sw button{width:36px;height:36px;border-radius:50%;border:3px solid transparent}
.sw button.on{border-color:var(--text)}
.smsg{min-height:20px;font-size:14px;margin:10px 0 0}`;
document.head.append(css);

const gear = document.createElement("button");
gear.className = "gear";
gear.textContent = "⚙";
gear.title = "Settings";
gear.setAttribute("aria-label", "Settings");
const themeBtn = $("theme");
themeBtn.style.marginLeft = "8px";
themeBtn.before(gear);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="setov"><div class="dlg sdlg" role="dialog" aria-modal="true" aria-labelledby="sett" style="max-width:440px">
  <h2 id="sett">Settings</h2>
  <p class="sub" id="setmail"></p>
  <h3 class="sh">Username</h3>
  <input class="tx" id="s-user" maxlength="20" autocomplete="off">
  <button class="sbtn" id="s-userbtn">Save username</button>
  <h3 class="sh">Profile color</h3>
  <div class="sw" id="s-colors"></div>
  <h3 class="sh">Change password</h3>
  <input class="tx" id="s-cur" type="password" placeholder="Current password" autocomplete="current-password">
  <input class="tx" id="s-new" type="password" placeholder="New password (8 or more characters)" autocomplete="new-password">
  <button class="sbtn" id="s-passbtn">Change password</button>
  <p class="smsg" id="s-msg" role="status"></p>
  <h3 class="sh">Danger zone</h3>
  <button class="sbtn red" id="s-del">Delete my account</button>
  <div id="s-delbox" hidden>
    <p class="sub">This permanently deletes your account, messages, and reactions. Enter your password and type DELETE.</p>
    <input class="tx" id="s-delpw" type="password" placeholder="Your password" autocomplete="current-password">
    <input class="tx" id="s-deltxt" placeholder="Type DELETE" autocomplete="off">
    <button class="sbtn red" id="s-delgo">Delete forever</button>
  </div>
  <div class="row"><button class="cancel" id="s-logout">Log out</button><button class="cancel" id="s-close">Close</button></div>
</div></div>`);

function say(t, ok) {
  const m = $("s-msg");
  m.textContent = t;
  m.style.color = ok ? "var(--accent)" : "var(--pink)";
}
async function openSettings() {
  if (!user) return;
  say("");
  $("s-delbox").hidden = true;
  $("s-cur").value = $("s-new").value = $("s-delpw").value = $("s-deltxt").value = "";
  $("setmail").textContent = "Signed in as " + user.email + " (only you can see this)";
  const { data } = await supabase.from("profiles").select("username,color").eq("id", user.id).maybeSingle();
  $("s-user").value = data ? data.username : "";
  const box = $("s-colors");
  box.textContent = "";
  COL.forEach((c) => {
    const b = document.createElement("button");
    b.style.background = c;
    b.setAttribute("aria-label", "Color " + c);
    if (data && data.color === c) b.className = "on";
    b.onclick = () => saveColor(c);
    box.append(b);
  });
  $("setov").classList.add("on");
}
function reloadSoon() { setTimeout(() => location.reload(), 700); }
async function saveUsername() {
  const v = $("s-user").value.trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(v)) return say("Username must be 3 to 20 letters, numbers, or underscores.");
  const { data, error } = await supabase.from("profiles").update({ username: v }).eq("id", user.id).select("id");
  if (error) return say(error.code === "23505" ? "That username is taken. Try another." : "Could not change your username.");
  if (!data || !data.length) return say("Could not change your username.");
  await supabase.auth.updateUser({ data: { username: v } });
  say("Username saved. Reloading...", true);
  reloadSoon();
}
async function saveColor(c) {
  const { data, error } = await supabase.from("profiles").update({ color: c }).eq("id", user.id).select("id");
  if (error || !data || !data.length) return say("Could not change your color.");
  say("Color saved. Reloading...", true);
  reloadSoon();
}
async function checkPassword(pw) {
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: pw });
  return !error;
}
async function changePass() {
  const cur = $("s-cur").value;
  const nw = $("s-new").value;
  if (!cur || nw.length < 8) return say("Enter your current password and a new one with 8 or more characters.");
  if (!(await checkPassword(cur))) return say("Your current password is wrong.");
  const { error } = await supabase.auth.updateUser({ password: nw });
  if (error) return say(error.message);
  $("s-cur").value = $("s-new").value = "";
  say("Password changed.", true);
}
async function deleteAccount() {
  if ($("s-deltxt").value.trim() !== "DELETE") return say("Type DELETE to confirm.");
  if (!(await checkPassword($("s-delpw").value))) return say("Your password is wrong.");
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    return say(error.message.includes("Only admin") ? "You are the only admin of a group that still has other members, so you cannot delete your account yet. Remove the members or ask for help first." : "Could not delete your account.");
  }
  try { await supabase.auth.signOut({ scope: "local" }); } catch (e) { /* ignore */ }
  location.reload();
}

gear.onclick = openSettings;
$("s-userbtn").onclick = saveUsername;
$("s-passbtn").onclick = changePass;
$("s-del").onclick = () => { $("s-delbox").hidden = !$("s-delbox").hidden; };
$("s-delgo").onclick = deleteAccount;
$("s-logout").onclick = async () => { await supabase.auth.signOut(); $("setov").classList.remove("on"); };
$("s-close").onclick = () => $("setov").classList.remove("on");
$("setov").onclick = (e) => { if (e.target === $("setov")) $("setov").classList.remove("on"); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("setov").classList.remove("on"); });

supabase.auth.onAuthStateChange((_e, s) => { user = s && s.user ? s.user : null; });
supabase.auth.getSession().then(({ data }) => { user = data.session ? data.session.user : null; });