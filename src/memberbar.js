const $ = (id) => document.getElementById(id);
const KEY = "rally-hide-members";
let wantHidden = false;
try { wantHidden = localStorage.getItem(KEY) === "1"; } catch (e) { /* ignore */ }

const css = document.createElement("style");
css.textContent = `
body.rmb-hide #mem{display:none!important}
body.rmb-hide .app{grid-template-columns:auto minmax(0,1fr)!important}`;
document.head.append(css);

// On phones Rally's member bar slides over the page. Then we leave it alone.
function overlay() {
  const p = getComputedStyle($("mem")).position;
  return p === "fixed" || p === "absolute";
}
function apply() {
  const on = wantHidden && !overlay();
  document.body.classList.toggle("rmb-hide", on);
  $("membtn").textContent = on ? "Show members" : "Members";
}

// Listens on the whole page and runs first, so Rally's own handler cannot get in the way
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element) || !t.closest("#membtn")) return;
  if (overlay()) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  wantHidden = !wantHidden;
  try { localStorage.setItem(KEY, wantHidden ? "1" : "0"); } catch (err) { /* ignore */ }
  apply();
}, true);

window.addEventListener("resize", apply);
apply();
console.log("[memberbar] ready");