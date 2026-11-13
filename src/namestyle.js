import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

const FONTS = {
  serif: '"Playfair Display", Georgia, serif',
  mono: '"JetBrains Mono", monospace',
  script: '"Caveat", cursive',
  rounded: '"Nunito", sans-serif',
  display: '"Lobster", cursive',
};
const FONT_NAMES = { "": "Default", serif: "Serif", mono: "Typewriter", script: "Handwriting", rounded: "Rounded", display: "Fancy" };

const fl = document.createElement("link");
fl.rel = "stylesheet";
fl.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=JetBrains+Mono:wght@600&family=Lobster&family=Nunito:wght@700&family=Playfair+Display:wght@700&display=swap";
document.head.append(fl);

const css = document.createElement("style");
css.textContent = `
#rns-btn{display:block;width:calc(100% - 16px);margin:6px 8px;text-align:left;padding:9px 12px;border-radius:10px;background:var(--raised);color:var(--text);font-weight:600}
#rns-hue{-webkit-appearance:none;appearance:none;width:100%;height:14px;border-radius:7px;margin:10px 0;outline:none;
  background:linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)}
#rns-hue::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid #10121d;cursor:pointer}
#rns-hue::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #10121d;cursor:pointer}
#rns-color{width:100%;height:46px;padding:0;border:1px solid var(--line);border-radius:10px;background:var(--raised);cursor:pointer}
#rns-font{width:100%;margin:6px 0 12px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--raised);color:var(--text);font:inherit}
#rns-preview{padding:14px;border-radius:10px;background:var(--raised);margin:12px 0;font-size:22px;font-weight:700;overflow-wrap:anywhere}
#rns-status{min-height:20px;font-size:14px;margin:6px 0 0}
#rns-reset{margin-top:6px;padding:6px 12px;border-radius:8px;background:var(--raised);color:var(--text);font-weight:600;font-size:13px}`;
document.head.append(css);

document.body.insertAdjacentHTML("beforeend", `
<div class="ov" id="rns-ov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="rns-title">
  <h2 id="rns-title">Name style</h2>
  <p class="sub">Pick any color and a font for your name. Everyone sees it in chat and the member list.</p>
  <label class="lb" for="rns-hue">Color spectrum</label>
  <input type="range" id="rns-hue" min="0" max="360" value="40">
  <label class="lb" for="rns-color">Or pick an exact color</label>
  <input type="color" id="rns-color" value="#ffb547">
  <button type="button" id="rns-reset">Use the default color</button>
  <label class="lb" for="rns-font">Font</label>
  <select id="rns-font"></select>
  <div id="rns-preview">You</div>
  <p id="rns-status" role="status"></p>
  <div class="row"><button class="cancel" id="rns-cancel">Close</button><button class="go amber" id="rns-save">Save</button></div>
</div></div>`);

Object.keys(FONT_NAMES).forEach((k) => {
  const o = document.createElement("option");
  o.value = k;
  o.textContent = FONT_NAMES[k];
  $("rns-font").append(o);
});

const btn = document.createElement("button");
btn.id = "rns-btn";
btn.textContent = "🎨 Name style";
const meRow = document.querySelector(".side .me");
if (meRow) meRow.before(btn); else document.querySelector(".side").append(btn);

const cache = new Map(); // user id -> { c: color or null, f: font key or null }
let waiting = new Set(), timer = null, myId = null, myName = "You", chosen = "";

function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

function clearPaint(e) {
  delete e.dataset.rnsv;
  e.style.fontFamily = "";
  ["color", "background", "-webkit-text-fill-color"].forEach((p) => e.style.removeProperty(p));
}

// Chat names
function paintChat(el, st) {
  const key = (st.c || "") + "|" + (st.f || "");
  if (!st.c && !st.f && !el.dataset.rnsv) return;
  if (el.dataset.rnsv === key) return;
  el.dataset.rnsv = key;
  el.style.fontFamily = st.f ? FONTS[st.f] : "";
  if (st.c) {
    el.style.setProperty("color", st.c, "important");
    el.style.setProperty("background", "none", "important");
    el.style.setProperty("-webkit-text-fill-color", st.c, "important");
  }
}

// Member list names (the name is plain text, so it gets wrapped in a span)
function findNameNode(row) {
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    if (n.parentElement.closest("button, .mact, .rbdg-wrap, .av, small")) continue;
    return n;
  }
  return null;
}
function paintMember(row, st) {
  let span = row.querySelector(".rns");
  if (!span) {
    const node = findNameNode(row);
    if (!node) return;
    span = document.createElement("span");
    span.className = "rns";
    node.replaceWith(span);
    span.append(node);
  }
  const key = (st.c || "") + "|" + (st.f || "");
  if (span.dataset.rnsv === key) return;
  span.dataset.rnsv = key;
  span.style.fontFamily = st.f ? FONTS[st.f] : "";
  span.style.color = st.c || "";
}

function paintAll() {
  $("msgs").querySelectorAll(".m[data-user] .n").forEach((n) => {
    const st = cache.get(n.closest(".m").dataset.user);
    if (st) paintChat(n, st);
  });
  $("memlist").querySelectorAll(":scope > div[data-user]").forEach((row) => {
    const st = cache.get(row.dataset.user);
    if (st && (st.c || st.f)) paintMember(row, st);
  });
}

async function fetchStyles() {
  const ids = [...waiting];
  waiting = new Set();
  if (!ids.length) return;
  const { data, error } = await supabase.from("profiles").select("id,name_color,name_font").in("id", ids);
  ids.forEach((id) => cache.set(id, {}));
  if (!error) (data || []).forEach((p) => cache.set(p.id, { c: p.name_color, f: p.name_font }));
  paintAll();
}

function need() {
  document.querySelectorAll("#msgs .m[data-user], #memlist > div[data-user]").forEach((el) => {
    const id = el.dataset.user;
    if (id && !cache.has(id)) waiting.add(id);
  });
  paintAll();
  if (waiting.size) {
    clearTimeout(timer);
    timer = setTimeout(fetchStyles, 150);
  }
}
new MutationObserver(need).observe($("msgs"), { childList: true, subtree: true });
new MutationObserver(need).observe($("memlist"), { childList: true, subtree: true });

// ---- The picker ----
function say(t, ok) {
  const s = $("rns-status");
  s.textContent = t;
  s.style.color = ok ? "var(--accent)" : "var(--pink)";
}
function preview() {
  const p = $("rns-preview");
  p.textContent = myName;
  p.style.color = chosen || "";
  p.style.fontFamily = $("rns-font").value ? FONTS[$("rns-font").value] : "";
}
function setColor(hex) {
  chosen = hex;
  if (hex) $("rns-color").value = hex;
  preview();
}

async function openPicker() {
  say("");
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return;
  myId = s.session.user.id;
  const { data } = await supabase.from("profiles").select("username,name_color,name_font").eq("id", myId).maybeSingle();
  myName = (data && data.username) || "You";
  chosen = (data && data.name_color) || "";
  if (chosen) $("rns-color").value = chosen;
  $("rns-font").value = (data && data.name_font) || "";
  preview();
  $("rns-ov").classList.add("on");
}
function closePicker() { $("rns-ov").classList.remove("on"); }

async function save() {
  $("rns-save").disabled = true;
  const font = $("rns-font").value;
  const { error } = await supabase.rpc("set_name_style", { p_color: chosen, p_font: font });
  $("rns-save").disabled = false;
  if (error) return say("Could not save. Did you run the SQL step?");
  cache.set(myId, { c: chosen || null, f: font || null });
  document.querySelectorAll("[data-rnsv]").forEach((e) => {
    if (e.closest("[data-user]") && e.closest("[data-user]").dataset.user === myId) clearPaint(e);
  });
  paintAll();
  say("Saved!", true);
  setTimeout(closePicker, 700);
}

btn.onclick = openPicker;
$("rns-hue").oninput = (e) => setColor(hsl(Number(e.target.value), 90, 60));
$("rns-color").oninput = (e) => setColor(e.target.value);
$("rns-reset").onclick = () => setColor("");
$("rns-font").onchange = preview;
$("rns-save").onclick = save;
$("rns-cancel").onclick = closePicker;
$("rns-ov").onclick = (e) => { if (e.target === $("rns-ov")) closePicker(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePicker(); });