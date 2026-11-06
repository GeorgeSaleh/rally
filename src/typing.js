import { supabase } from "./supabase.js";

const inp = document.getElementById("inp");
const tip = document.getElementById("typing");
const names = {};
let chan = null, chanId = null, last = 0, timer = null;

async function nameOf(uid) {
  if (!names[uid]) {
    const { data } = await supabase.from("profiles").select("username").eq("id", uid).maybeSingle();
    names[uid] = data ? data.username : "Someone";
  }
  return names[uid];
}
function join(cid) {
  if (chan) supabase.removeChannel(chan);
  chan = null;
  chanId = cid;
  tip.textContent = "";
  if (!cid) return;
  chan = supabase
    .channel("typing-" + cid)
    .on("broadcast", { event: "typing" }, async ({ payload }) => {
      const n = await nameOf(payload.uid);
      tip.textContent = n + " is typing...";
      clearTimeout(timer);
      timer = setTimeout(() => { tip.textContent = ""; }, 3000);
    })
    .subscribe();
}
setInterval(() => {
  const cid = window.rally && window.rally.cid;
  if (cid !== chanId) join(cid || null);
}, 600);

inp.addEventListener("input", () => {
  const r = window.rally;
  if (!chan || !r || !r.uid) return;
  const now = Date.now();
  if (now - last < 2000) return;
  last = now;
  chan.send({ type: "broadcast", event: "typing", payload: { uid: r.uid } });
});