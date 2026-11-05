import "./auth.css";
import { supabase } from "./supabase.js";

const overlay = document.createElement("div");
overlay.className = "auth-ov";
overlay.innerHTML = `
  <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <div class="auth-logo">Rally</div>
    <h2 id="auth-title">Welcome</h2>
    <div class="auth-tabs" id="auth-tabs">
      <button type="button" id="tab-login" class="on">Log in</button>
      <button type="button" id="tab-signup">Sign up</button>
    </div>
    <label id="uname-wrap" hidden>Username
      <input id="a-user" autocomplete="username" maxlength="20" placeholder="3 to 20 letters, numbers, _">
    </label>
    <label id="email-wrap">Email
      <input id="a-email" type="email" autocomplete="email" placeholder="you@example.com">
    </label>
    <label id="pass-wrap"><span id="pass-label">Password</span>
      <input id="a-pass" type="password" autocomplete="current-password" placeholder="At least 8 characters">
    </label>
    <button type="button" id="a-forgot" style="background:none;color:var(--accent);font-size:13px;padding:0;margin:-4px 0 10px;text-decoration:underline">Forgot password?</button>
    <button type="button" id="back-login" hidden style="background:none;color:var(--accent);font-size:13px;padding:0;margin:0 0 10px;text-decoration:underline">Back to log in</button>
    <p id="a-msg" class="auth-msg" role="status"></p>
    <button type="button" id="a-go" class="auth-go">Log in</button>
    <p class="auth-note">Your email stays private. Other people only see your username.</p>
  </div>`;
document.body.append(overlay);

const $ = (id) => document.getElementById(id);
let mode = "login";
let recovering = false;

function say(text, bad = true) {
  const m = $("a-msg");
  m.textContent = text;
  m.className = "auth-msg " + (bad ? "bad" : "ok");
}

function setMode(next) {
  mode = next;
  const reset = next === "reset";
  const forgot = next === "forgot";
  $("tab-login").classList.toggle("on", next === "login");
  $("tab-signup").classList.toggle("on", next === "signup");
  $("auth-tabs").hidden = reset || forgot;
  $("uname-wrap").hidden = next !== "signup";
  $("email-wrap").hidden = reset;
  $("pass-wrap").hidden = forgot;
  $("a-forgot").hidden = next !== "login";
  $("back-login").hidden = !forgot;
  $("pass-label").textContent = reset ? "New password" : "Password";
  $("auth-title").textContent = reset
    ? "Choose a new password"
    : forgot
    ? "Reset your password"
    : "Welcome";
  $("a-go").textContent = {
    login: "Log in",
    signup: "Create account",
    forgot: "Send reset link",
    reset: "Save new password",
  }[next];
  $("a-pass").autocomplete = next === "login" ? "current-password" : "new-password";
  say("");
}

async function go() {
  const email = $("a-email").value.trim();
  const password = $("a-pass").value;
  const username = $("a-user").value.trim();
  $("a-go").disabled = true;
  try {
    if (mode === "forgot") {
      if (!email) return say("Enter your email.");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) return say(error.message);
      return say("If that email has an account, a reset link is on its way. Check your inbox.", false);
    }
    if (mode === "reset") {
      if (password.length < 8) return say("Password must be at least 8 characters.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return say(error.message);
      recovering = false;
      const { data } = await supabase.auth.getSession();
      setMode("login");
      show(data.session);
      return;
    }
    if (!email || !password) return say("Enter your email and password.");
    if (mode === "signup") {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
        return say("Username must be 3 to 20 letters, numbers, or underscores.");
      }
      if (password.length < 8) return say("Password must be at least 8 characters.");
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo: window.location.origin },
      });
      if (error) {
        return say(
          error.message.includes("Database error")
            ? "That username is taken. Try another."
            : error.message
        );
      }
      if (!data.session) {
        say("Almost there! Check your email, click the confirmation link, then log in.", false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return say(
          error.message === "Email not confirmed"
            ? "Please confirm your email first. Check your inbox."
            : "Wrong email or password."
        );
      }
    }
  } finally {
    $("a-go").disabled = false;
  }
}

const logout = document.createElement("button");
logout.textContent = "Log out";
logout.hidden = true;
logout.onclick = () => supabase.auth.signOut();
document.querySelector(".top .sp").after(logout);

function show(session) {
  const user = session && session.user;
  overlay.hidden = !!user && !recovering;
  logout.hidden = !user;
  if (!user) return;
  const name = (user.user_metadata && user.user_metadata.username) || user.email.split("@")[0];
  const me = document.querySelector(".me");
  me.querySelector(".av").textContent = name[0].toUpperCase();
  for (const n of me.childNodes) {
    if (n.nodeType === 3 && n.nodeValue.trim()) n.nodeValue = name;
  }
}

$("tab-login").onclick = () => setMode("login");
$("tab-signup").onclick = () => setMode("signup");
$("a-forgot").onclick = () => setMode("forgot");
$("back-login").onclick = () => setMode("login");
$("a-go").onclick = go;
overlay.addEventListener("keydown", (e) => {
  if (e.key === "Enter") go();
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    recovering = true;
    setMode("reset");
    overlay.hidden = false;
    return;
  }
  show(session);
});
supabase.auth.getSession().then(({ data }) => show(data.session));
setMode("login");