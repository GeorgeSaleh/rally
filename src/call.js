import { supabase } from "./supabase.js";

const CALLS_ENABLED = true;
const MAX = 6;
const CALL_MARK = "📞 Started a call";
const COL = ["#ffb547", "#ff5c8a", "#7fd6ff", "#b69cff", "#8be28b"];
const STUN = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
const TURN = import.meta.env.VITE_TURN_URL
  ? [{ urls: import.meta.env.VITE_TURN_URL, username: import.meta.env.VITE_TURN_USER, credential: import.meta.env.VITE_TURN_PASS }]
  : [];
const ICE = { iceServers: STUN.concat(TURN) };

const $ = (id) => document.getElementById(id);
const R = () => window.rally || {};
const sid = crypto.randomUUID();
const peers = new Map();
const profs = {};
let uid = null, blocked = new Set();
let watch = null, watchCid = null, watchCount = 0;
let room = null, roomCid = null, inCall = false;
let mic = null, cam = null, micOn = false, camOn = false;
let ctx = null, timerId = null, startedAt = 0, selfAn = null;
let target = null, joinedAt = 0;

if (CALLS_ENABLED) {
  const css = document.createElement("style");
  css.textContent = `
#callbtn{padding:6px 12px;border-radius:999px;background:var(--raised);color:var(--text);font-weight:600}
#callbtn.live{background:var(--accent);color:var(--on-accent)}
.callov{position:fixed;inset:0;z-index:55;display:none;flex-direction:column;color:#e9ebf7;
  background:radial-gradient(1100px 600px at 15% -10%,#3a2766 0%,transparent 60%),radial-gradient(900px 500px at 110% 110%,#5a1f3e 0%,transparent 55%),#0b0d17;
  padding-top:env(safe-area-inset-top,0px)}
.callov.on{display:flex}
.chead{display:flex;align-items:center;gap:12px;padding:14px 18px}
.chead h2{margin:0;font:800 18px var(--head);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chead span{font-size:13px;color:#a9aed0}
.chead button{padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.1);color:#e9ebf7;font-weight:600}
.cgrid{flex:1;display:grid;gap:14px;padding:8px 16px 110px;overflow:auto;align-content:center;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.ctile{position:relative;aspect-ratio:16/9;max-height:62vh;width:100%;border-radius:22px;overflow:hidden;
  background:linear-gradient(145deg,#1a1d33,#12142a);border:2px solid rgba(255,255,255,.06);transition:border-color .2s,box-shadow .2s}
.ctile video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .25s}
.ctile.cam video{opacity:1}
.ctile.me video{transform:scaleX(-1)}
.ctile .cav{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:opacity .25s}
.ctile.cam .cav{opacity:0}
.ctile .cav b{width:clamp(64px,22%,110px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font:800 clamp(26px,5vw,44px) var(--head);color:#10121d}
.ctile .cname{position:absolute;left:12px;bottom:12px;padding:5px 12px;border-radius:999px;font-size:13px;font-weight:600;
  background:rgba(10,12,24,.6);backdrop-filter:blur(8px);max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ctile .cnote{position:absolute;top:12px;left:12px;font-size:12px;color:#ffb3c8}
.ctile.speak{border-color:#ffb547;box-shadow:0 0 0 4px rgba(255,181,71,.25),0 0 40px rgba(255,92,138,.35);animation:cpulse 1.2s ease-in-out infinite}
@keyframes cpulse{50%{box-shadow:0 0 0 7px rgba(255,181,71,.15),0 0 55px rgba(255,92,138,.5)}}
.cbar{position:absolute;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;gap:12px;align-items:center;
  padding:10px 14px;border-radius:999px;background:rgba(18,20,38,.72);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 40px rgba(0,0,0,.45)}
.cbar button{width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:22px;transition:transform .15s,background .15s}
.cbar button:hover{transform:translateY(-2px);background:rgba(255,255,255,.2)}
.cbar button.off{background:#ff5c8a}
.cbar button.leave{width:auto;padding:0 22px;border-radius:999px;background:#e5365f;font-size:15px;font-weight:700}
.cnote2{position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:11px;color:#8a8fb5}
.cpill{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:56;display:none;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;
  background:#12142a;color:#e9ebf7;border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 30px rgba(0,0,0,.4);font-size:14px}
.cpill.on{display:flex}
.cpill i{width:9px;height:9px;border-radius:50%;background:#8be28b;animation:cpulse 1.2s infinite}
.cpill button{padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font-weight:600}
.cpill button.red{background:#e5365f}
#cinvite{position:fixed;top:calc(14px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:58;display:none;align-items:center;gap:10px;padding:10px 14px;border-radius:999px;
  background:#12142a;color:#e9ebf7;border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 40px rgba(0,0,0,.5);font-weight:600;max-width:calc(100% - 24px)}
#cinvite.on{display:flex;animation:cpulse 1.2s ease-in-out infinite}
#cinvite button{padding:6px 14px;border-radius:999px;background:#8be28b;color:#10121d;font-weight:700}
#cinvite button.no{background:rgba(255,255,255,.14);color:#fff}
@media (max-width:560px){.cbar{gap:8px;padding:8px 10px}.cbar button{width:46px;height:46px;font-size:19px}}`;
  document.head.append(css);

  document.body.insertAdjacentHTML("beforeend", `
<div class="callov" id="callov" role="dialog" aria-modal="true" aria-label="Voice and video call">
  <div class="chead"><h2 id="ctitle">Call</h2><span id="cinfo"></span><button id="cmin">Minimize</button></div>
  <div class="cgrid" id="cgrid"></div>
  <div class="cbar">
    <button id="cmic" title="Microphone" aria-label="Microphone">🎙️</button>
    <button id="ccam" title="Camera" aria-label="Camera">📷</button>
    <button id="cleave" class="leave">Leave</button>
  </div>
  <div class="cnote2">You join muted with your camera off. Calls are not recorded. Be kind, and tell an admin if something is wrong.</div>
</div>
<div id="cinvite" role="alert"><span id="cinvtxt"></span><button id="cinvyes">Join</button><button id="cinvno" class="no">Dismiss</button></div>
<div class="cpill" id="cpill"><i></i><span id="cpilltxt">In call</span><button id="cret">Return</button><button id="cleave2" class="red">Leave</button></div>`);

  const btn = document.createElement("button");
  btn.id = "callbtn";
  $("membtn").before(btn);
  btn.onclick = () => (inCall ? showOverlay(true) : joinChannel());
  $("cmin").onclick = () => showOverlay(false);
  $("cret").onclick = () => showOverlay(true);
  $("cleave").onclick = leaveCall;
  $("cleave2").onclick = leaveCall;
  $("cmic").onclick = toggleMic;
  $("ccam").onclick = toggleCam;
  const dcb = document.createElement("button");
  dcb.id = "dmcallbtn";
  dcb.textContent = "📞 Call";
  dcb.hidden = true;
  $("dmblock").before(dcb);
  dcb.onclick = () => {
    if (inCall) return showOverlay(true);
    const th = $("dmov").dataset.thread;
    if (!th) return;
    joinTarget({ kind: "dm", id: th, topic: "dmcall:" + th, max: 2, title: "Private call with " + ($("dmname").textContent || "your friend") }, true);
  };
  let invTimer = null, invThread = null, invName = "";
  const hideInvite = () => { $("cinvite").classList.remove("on"); clearTimeout(invTimer); };
  $("cinvyes").onclick = () => { hideInvite(); joinDm(invThread, invName); };
  $("cinvno").onclick = hideInvite;
  document.addEventListener("rally-call-invite", async (e) => {
    if (inCall) return;
    const p = await profile(e.detail.from);
    invThread = e.detail.thread;
    invName = p.username;
    $("cinvtxt").textContent = "📞 " + p.username + " is calling you";
    $("cinvite").classList.add("on");
    clearTimeout(invTimer);
    invTimer = setTimeout(hideInvite, 45000);
  });
  window.rallyCall = { joinDm };
  renderBtn();
  setInterval(poll, 600);
  setInterval(speakTick, 160);
  window.addEventListener("pagehide", () => { if (inCall) leaveCall(); });
  supabase.auth.onAuthStateChange((_e, s) => {
    uid = s && s.user ? s.user.id : null;
    if (!uid && inCall) leaveCall();
  });
  supabase.auth.getSession().then(({ data }) => { uid = data.session ? data.session.user.id : null; });
}

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("on"), 2800);
}
async function profile(id) {
  if (!profs[id]) {
    const { data } = await supabase.from("profiles").select("username,color").eq("id", id).maybeSingle();
    profs[id] = data || { username: "Unknown", color: COL[0] };
  }
  return profs[id];
}
async function loadBlocks() {
  const { data } = await supabase.from("blocks").select("blocked_id");
  blocked = new Set((data || []).map((x) => x.blocked_id));
}
function renderBtn() {
  const b = $("callbtn");
  if (!b) return;
  b.classList.toggle("live", inCall);
  b.textContent = inCall ? "In call" : watchCount > 0 ? "Join call (" + watchCount + ")" : "Start call";
  b.disabled = !inCall && !R().cid;
}
function showOverlay(on) {
  $("callov").classList.toggle("on", on && inCall);
  $("cpill").classList.toggle("on", inCall && !on);
  if (on && inCall) {
    $("ctitle").textContent = target ? target.title : "Call";
  }
}

async function poll() {
  const dcb = $("dmcallbtn");
  if (dcb) dcb.hidden = !($("dmov").classList.contains("chat") && $("dmov").dataset.thread);
  if (inCall) return;
  const cid = R().cid || null;
  if (cid === watchCid) return;
  watchCid = cid;
  if (watch) { supabase.removeChannel(watch); watch = null; }
  watchCount = 0;
  renderBtn();
  if (!cid) return;
  await supabase.realtime.setAuth();
  const ch = supabase.channel("call:" + cid, { config: { private: true, presence: { key: sid } } });
  watch = ch;
  ch.on("presence", { event: "sync" }, () => {
    if (watch !== ch) return;
    watchCount = Object.keys(ch.presenceState()).length;
    renderBtn();
  });
  ch.subscribe();
}

function ensureAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
}
function analyserFor(track) {
  try {
    ensureAudio();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(an);
    return { an, buf: new Uint8Array(an.fftSize) };
  } catch (e) {
    return null;
  }
}
function level(a) {
  a.an.getByteTimeDomainData(a.buf);
  let s = 0;
  for (let i = 0; i < a.buf.length; i++) {
    const v = (a.buf[i] - 128) / 128;
    s += v * v;
  }
  return Math.sqrt(s / a.buf.length);
}
function speakTick() {
  if (!inCall) return;
  const me = $("tile-me");
  if (me) me.classList.toggle("speak", !!(micOn && selfAn && level(selfAn) > 0.035));
  peers.forEach((p) => {
    if (p.tile) p.tile.classList.toggle("speak", !!(p.mic && p.an && level(p.an) > 0.035));
  });
}

function makeTile(id) {
  const t = document.createElement("div");
  t.className = "ctile";
  if (id) t.id = id;
  const v = document.createElement("video");
  v.autoplay = true;
  v.playsInline = true;
  const av = document.createElement("div");
  av.className = "cav";
  const b = document.createElement("b");
  av.append(b);
  const nm = document.createElement("div");
  nm.className = "cname";
  const note = document.createElement("div");
  note.className = "cnote";
  t.append(v, av, nm, note);
  $("cgrid").append(t);
  return { t, v, b, nm, note };
}
function paintTile(parts, o) {
  parts.t.classList.toggle("cam", !!o.cam);
  parts.b.textContent = (o.name || "?")[0].toUpperCase();
  parts.b.style.background = o.color || COL[0];
  parts.nm.textContent = (o.mic ? "" : "🔇 ") + o.name;
  parts.note.textContent = o.note || "";
}
let selfParts = null;
async function paintSelf() {
  if (!selfParts) return;
  const p = await profile(uid);
  paintTile(selfParts, { name: p.username + " (you)", color: p.color, mic: micOn, cam: camOn });
}
function updateInfo() {
  const n = peers.size + 1;
  $("cinfo").textContent = n + (n === 1 ? " person" : " people") + " · " + fmtTime();
  $("cpilltxt").textContent = "In call · " + n;
}
function fmtTime() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function makePeer(id, puid) {
  const pc = new RTCPeerConnection(ICE);
  const parts = makeTile();
  const p = { id, uid: puid || null, pc, parts, tile: parts.t, video: parts.v, stream: new MediaStream(), pending: [], mic: false, cam: false, aSender: null, vSender: null, an: null, failed: false };
  peers.set(id, p);
  parts.v.srcObject = p.stream;
  pc.onicecandidate = (e) => { if (e.candidate) sig(id, { type: "ice", ice: e.candidate.toJSON() }); };
  pc.ontrack = (e) => {
    p.stream.addTrack(e.track);
    if (e.track.kind === "audio") p.an = analyserFor(e.track);
  };
  pc.onconnectionstatechange = () => {
    p.failed = pc.connectionState === "failed";
    paintPeer(p);
  };
  paintPeer(p);
  return p;
}
async function paintPeer(p) {
  const prof = p.uid ? await profile(p.uid) : { username: "Joining...", color: COL[0] };
  const isB = !!(p.uid && blocked.has(p.uid));
  p.video.muted = isB;
  paintTile(p.parts, {
    name: prof.username,
    color: prof.color,
    mic: p.mic,
    cam: p.cam && !isB,
    note: isB ? "Blocked: audio and video hidden" : p.failed ? "Connection failed (network may block calls)" : "",
  });
}
function removePeer(id) {
  const p = peers.get(id);
  if (!p) return;
  try { p.pc.close(); } catch (e) { /* ignore */ }
  p.tile.remove();
  peers.delete(id);
}
function sig(to, data) {
  if (room) room.send({ type: "broadcast", event: "sig", payload: { to, from: sid, ...data } });
}
function attachOfferer(p) {
  const a = p.pc.addTransceiver("audio", { direction: "sendrecv" });
  const v = p.pc.addTransceiver("video", { direction: "sendrecv" });
  p.aSender = a.sender;
  p.vSender = v.sender;
  if (mic) a.sender.replaceTrack(mic);
  if (cam) v.sender.replaceTrack(cam);
}
function attachAnswerer(p) {
  p.pc.getTransceivers().forEach((t) => {
    t.direction = "sendrecv";
    if (t.receiver.track.kind === "audio") {
      p.aSender = t.sender;
      if (mic) t.sender.replaceTrack(mic);
    } else {
      p.vSender = t.sender;
      if (cam) t.sender.replaceTrack(cam);
    }
  });
}
async function flush(p) {
  const list = p.pending.splice(0);
  for (const c of list) { try { await p.pc.addIceCandidate(c); } catch (e) { /* ignore */ } }
}
async function offerTo(p) {
  attachOfferer(p);
  const o = await p.pc.createOffer();
  await p.pc.setLocalDescription(o);
  sig(p.id, { type: "offer", sdp: p.pc.localDescription.toJSON() });
}
async function onSig(m) {
  if (!room || !inCall || m.to !== sid) return;
  let p = peers.get(m.from);
  try {
    if (m.type === "offer") {
      if (!p) p = makePeer(m.from, null);
      await p.pc.setRemoteDescription(m.sdp);
      attachAnswerer(p);
      const a = await p.pc.createAnswer();
      await p.pc.setLocalDescription(a);
      sig(m.from, { type: "answer", sdp: p.pc.localDescription.toJSON() });
      flush(p);
    } else if (m.type === "answer" && p) {
      await p.pc.setRemoteDescription(m.sdp);
      flush(p);
    } else if (m.type === "ice" && p) {
      if (p.pc.remoteDescription) { try { await p.pc.addIceCandidate(m.ice); } catch (e) { /* ignore */ } }
      else p.pending.push(m.ice);
    }
  } catch (e) {
    if (p) { p.failed = true; paintPeer(p); }
  }
}
function onSync() {
  if (!room) return;
  const state = room.presenceState();
  const ids = Object.keys(state).filter((k) => k !== sid);
  const all = ids.map((k) => ({ k, t: ((state[k] && state[k][0]) || {}).t || 0 })).concat({ k: sid, t: joinedAt });
  all.sort((a, b) => a.t - b.t || (a.k < b.k ? -1 : 1));
  if (target && all.findIndex((x) => x.k === sid) >= target.max) {
    toast("This call is full (" + target.max + " people).");
    leaveCall();
    return;
  }
  [...peers.keys()].forEach((k) => { if (!ids.includes(k)) removePeer(k); });
  ids.forEach((k) => {
    const meta = (state[k] && state[k][0]) || {};
    let p = peers.get(k);
    if (!p) {
      p = makePeer(k, meta.uid);
      if (sid > k) offerTo(p);
    }
    if (!p.uid && meta.uid) p.uid = meta.uid;
    p.mic = !!meta.mic;
    p.cam = !!meta.cam;
    paintPeer(p);
  });
  updateInfo();
}

function joinChannel() {
  const cid = R().cid;
  if (!cid || inCall) return;
  if (watchCount >= MAX) return toast("This call is full (" + MAX + " people).");
  joinTarget({ kind: "ch", id: cid, topic: "call:" + cid, max: MAX, title: "Call in #" + ($("cname").textContent || "").replace(/^#\s*/, "") }, false);
}
function joinDm(thread, name) {
  if (inCall) return showOverlay(true);
  joinTarget({ kind: "dm", id: thread, topic: "dmcall:" + thread, max: 2, title: "Private call with " + (name || "your friend") }, false);
}
async function joinTarget(t, invite) {
  if (inCall || !uid) return;
  if (!navigator.mediaDevices || !window.RTCPeerConnection) return toast("Calls are not supported on this browser.");
  await loadBlocks();
  if (watch) { const w = watch; watch = null; await supabase.removeChannel(w); }
  target = { ...t, invite };
  inCall = true;
  joinedAt = Date.now();
  micOn = false;
  camOn = false;
  ensureAudio();
  $("cgrid").textContent = "";
  selfParts = makeTile("tile-me");
  selfParts.t.classList.add("me");
  startedAt = Date.now();
  paintSelf();
  syncButtons();
  showOverlay(true);
  renderBtn();
  timerId = setInterval(updateInfo, 1000);
  await supabase.realtime.setAuth();
  room = supabase.channel(target.topic, { config: { private: true, presence: { key: sid }, broadcast: { self: false } } });
  room
    .on("presence", { event: "sync" }, onSync)
    .on("broadcast", { event: "sig" }, ({ payload }) => onSig(payload))
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await room.track({ uid, mic: false, cam: false, t: joinedAt });
        onSync();
        if (inCall && target && target.kind === "dm" && target.invite) {
          const { error } = await supabase.from("dm_messages").insert({ thread_id: target.id, sender: uid, content: CALL_MARK });
          if (error) {
            toast("Could not reach them. They may have blocked you, or you no longer share a group.");
            leaveCall();
          }
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        toast("Could not join the call. You may not have access to it.");
        leaveCall();
      }
    });
}
function leaveCall() {
  if (!inCall) return;
  inCall = false;
  target = null;
  [mic, cam].forEach((t) => t && t.stop());
  mic = cam = null;
  micOn = camOn = false;
  selfAn = null;
  [...peers.keys()].forEach(removePeer);
  if (room) {
    try { room.untrack(); } catch (e) { /* ignore */ }
    supabase.removeChannel(room);
    room = null;
  }
  clearInterval(timerId);
  $("cgrid").textContent = "";
  selfParts = null;
  showOverlay(false);
  watchCid = null;
  watchCount = 0;
  renderBtn();
}
function syncButtons() {
  $("cmic").textContent = micOn ? "🎙️" : "🔇";
  $("cmic").classList.toggle("off", !micOn);
  $("ccam").textContent = "📷";
  $("ccam").classList.toggle("off", !camOn);
  $("cmic").title = micOn ? "Mute" : "Unmute";
  $("ccam").title = camOn ? "Turn camera off" : "Turn camera on";
}
function publish() {
  syncButtons();
  paintSelf();
  if (room) room.track({ uid, mic: micOn, cam: camOn, t: joinedAt });
}
async function toggleMic() {
  if (!inCall) return;
  if (!mic) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      mic = s.getAudioTracks()[0];
      selfAn = analyserFor(mic);
      peers.forEach((p) => { if (p.aSender) p.aSender.replaceTrack(mic); });
      micOn = true;
    } catch (e) {
      return toast("Could not use your microphone. Check your browser permissions.");
    }
  } else {
    micOn = !micOn;
  }
  mic.enabled = micOn;
  publish();
}
async function toggleCam() {
  if (!inCall) return;
  if (!camOn) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } });
      cam = s.getVideoTracks()[0];
    } catch (e) {
      return toast("Could not use your camera. Check your browser permissions.");
    }
    camOn = true;
    peers.forEach((p) => { if (p.vSender) p.vSender.replaceTrack(cam); });
    selfParts.v.srcObject = new MediaStream([cam]);
  } else {
    camOn = false;
    if (cam) cam.stop();
    peers.forEach((p) => { if (p.vSender) p.vSender.replaceTrack(null); });
    cam = null;
    selfParts.v.srcObject = null;
  }
  publish();
}