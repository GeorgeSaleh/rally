import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

const LABELS = {
  og: { text: "OG", tip: "OG: one of the first people on Rally" },
  developer: { text: "DEV", tip: "Developer: helps build Rally" },
  tester: { text: "TESTER", tip: "Tester: helped test Rally" },
};
const ORDER = ["og", "developer", "tester"];

const cache = new Map(); // user id -> list of badge names
let waiting = new Set();
let timer = null;

const css = document.createElement("style");
css.textContent = `
.rbdg-name{display:inline-flex;align-items:center;flex:0 1 auto;min-width:0}
.rbdg-wrap{display:inline-flex;flex:none;gap:4px;margin:0 6px;vertical-align:middle;width:auto}
.rbdg{
  position:relative;overflow:hidden;display:inline-block;
  padding:1px 8px;border-radius:999px;
  font:800 10px/16px var(--head);letter-spacing:.6px;color:#10121d;
  background:linear-gradient(110deg,#ff5c5c,#ffb547,#f4ff5c,#5cff8a,#5cd6ff,#b69cff,#ff5cd6,#ff5c5c);
  background-size:300% 100%;
  animation:rbdg-flow 4s linear infinite;
  box-shadow:0 0 8px rgba(255,255,255,.25)
}
.rbdg::after{
  content:"";position:absolute;inset:0;
  background:linear-gradient(100deg,transparent 35%,rgba(255,255,255,.8) 50%,transparent 65%);
  transform:translateX(-130%);
  animation:rbdg-shine 2.8s ease-in-out infinite
}
@keyframes rbdg-flow{from{background-position:0% 0}to{background-position:100% 0}}
@keyframes rbdg-shine{0%{transform:translateX(-130%)}55%,100%{transform:translateX(130%)}}
@media (prefers-reduced-motion:reduce){.rbdg,.rbdg::after{animation:none}}`;
document.head.append(css);

function makeBadges(list) {
  const wrap = document.createElement("span");
  wrap.className = "rbdg-wrap";
  ORDER.filter((b) => list.includes(b)).forEach((b) => {
    const s = document.createElement("span");
    s.className = "rbdg";
    s.textContent = LABELS[b].text;
    s.title = LABELS[b].tip;
    wrap.append(s);
  });
  return wrap;
}

// Chat message: badge goes right after the username
function decorateMsg(el) {
  if (el.querySelector(".rbdg-wrap")) return;
  const list = cache.get(el.dataset.user);
  if (!list || !list.length) return;
  const name = el.querySelector(".n");
  if (name) name.after(makeBadges(list));
}

// Finds the username text inside a member row (skips avatar, buttons, tags)
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

// Member list row: name and badge are put in one box so they stay together
function decorateMember(row) {
  if (row.querySelector(".rbdg-wrap")) return;
  const list = cache.get(row.dataset.user);
  if (!list || !list.length) return;
  const wrap = makeBadges(list);
  const node = findNameNode(row);
  if (!node) return;
  if (node.parentElement === row) {
    const box = document.createElement("span");
    box.className = "rbdg-name";
    node.replaceWith(box);
    box.append(node, wrap);
  } else {
    node.parentElement.append(wrap);
  }
}

function decorateAll() {
  $("msgs").querySelectorAll(".m[data-user]").forEach(decorateMsg);
  $("memlist").querySelectorAll(":scope > div[data-user]").forEach(decorateMember);
}

async function fetchBadges() {
  const ids = [...waiting];
  waiting = new Set();
  if (!ids.length) return;
  const { data, error } = await supabase.from("user_badges").select("user_id,badge").in("user_id", ids);
  if (error) return;
  ids.forEach((id) => cache.set(id, []));
  (data || []).forEach((r) => cache.get(r.user_id).push(r.badge));
  decorateAll();
}

// Ask for badges of anyone we have not looked up yet
function need() {
  document.querySelectorAll(".m[data-user], #memlist > div[data-user]").forEach((el) => {
    const id = el.dataset.user;
    if (id && !cache.has(id)) waiting.add(id);
  });
  decorateAll();
  if (waiting.size) {
    clearTimeout(timer);
    timer = setTimeout(fetchBadges, 150);
  }
}

new MutationObserver(need).observe($("msgs"), { childList: true, subtree: true });
new MutationObserver(need).observe($("memlist"), { childList: true, subtree: true });