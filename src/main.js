import "./style.css";
const COL=["#ffb547","#ff5c8a","#7fd6ff","#b69cff","#8be28b"];
const G={
 Homeroom:{k:"H",code:"HR-4F7K",ch:{general:[["Maya","Anyone else finish the bio worksheet?","3:02 PM"],["Jonah","Page 4 was brutal. Study group at lunch?","3:04 PM"],["Priya","I’m in. Rally gets a table by the windows.","3:05 PM"]],homework:[["Jonah","Math test is moved to Friday.","1:20 PM"]],memes:[["Maya","Posting the teacher-sneeze clip tomorrow.","9:10 AM"]]},mem:["Maya","Jonah","Priya","Eli"]},
 Band:{k:"B",code:"BD-92QX",ch:{general:[["Eli","Rehearsal is in room 12 on Thursday.","4:40 PM"],["Priya","Bringing the extra amp.","4:41 PM"]],setlist:[["Eli","Opener: the new one. Closer: the old one.","4:50 PM"]]},mem:["Eli","Priya","Sam"]},
 Gaming:{k:"G",code:"GM-3LZA",ch:{general:[["Sam","Friday lobby at 7?","6:15 PM"],["Jonah","Yes. I’m bringing snacks.","6:16 PM"]],clips:[["Sam","This clutch was an accident, I swear.","5:00 PM"]]},mem:["Sam","Jonah","Maya"]}
};
const $=id=>document.getElementById(id);
let g="Homeroom",c="general";
const col=n=>COL[[...n].reduce((a,x)=>a+x.charCodeAt(0),0)%COL.length];
function av(n){const s=document.createElement("span");s.className="av";s.style.background=col(n);s.textContent=n[0];return s}
function toast(t){const e=$("toast");e.textContent=t;e.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("on"),2200)}
function rail(){const r=$("rail");r.textContent="";const l=document.createElement("div");l.className="logo";l.textContent="R";r.append(l);
 for(const n in G){const b=document.createElement("button");b.className="grp";b.textContent=G[n].k;b.title=n;b.setAttribute("aria-label",n);b.setAttribute("aria-current",n===g);b.onclick=()=>{g=n;c=Object.keys(G[n].ch)[0];draw()};r.append(b)}
 const a=document.createElement("button");a.className="grp add";a.textContent="+";a.title="Create or join with a code";a.setAttribute("aria-label","Create or join a group");a.onclick=()=>toast("Joining with an invite code comes in Phase 5");r.append(a)}
function chans(){$("gname").textContent=g;$("gcode").textContent=G[g].code;const w=$("chs");w.textContent="";
 for(const n in G[g].ch){const b=document.createElement("button");b.className="ch";b.textContent="# "+n;b.setAttribute("aria-current",n===c);if(n==="homework"||n==="clips"){const i=document.createElement("i");i.textContent="2";b.append(i)}b.onclick=()=>{c=n;draw();document.body.classList.remove("show-left");$("app").classList.remove("show-left")};w.append(b)}}
function msg(n,t,time,mine){const m=document.createElement("div");m.className="m"+(mine?" mine":"");const b=document.createElement("div");b.className="b";
 const h=document.createElement("div");const nm=document.createElement("span");nm.className="n";nm.textContent=n;const tm=document.createElement("span");tm.className="t";tm.textContent=time;h.append(nm,tm);
 const p=document.createElement("p");p.textContent=t;const a=document.createElement("div");a.className="act";
 for(const [l,f] of [["React",()=>toast("Reactions come in Phase 5")],["Reply",()=>{$("inp").focus();$("inp").placeholder="Replying to "+n}],["Report",()=>openReport(n,t)]]){const x=document.createElement("button");x.textContent=l;x.onclick=f;a.append(x)}
 b.append(h,p,a);m.append(av(n),b);$("msgs").append(m)}
function draw(){rail();chans();$("cname").textContent="# "+c;const w=$("msgs");w.textContent="";G[g].ch[c].forEach(x=>msg(...x));w.scrollTop=w.scrollHeight;
 const l=$("memlist");l.textContent="";G[g].mem.forEach((n,i)=>{const d=document.createElement("div");d.append(av(n),n);if(!i){const s=document.createElement("small");s.textContent="admin";d.append(s)}l.append(d)});
 $("inp").placeholder="Message #"+c;$("typing").textContent=""}
function send(){const v=$("inp");const t=v.value.trim();if(!t)return;const now=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
 G[g].ch[c].push(["You",t,now]);msg("You",t,now,true);v.value="";$("msgs").scrollTop=1e9;
 const who=G[g].mem[0];$("typing").textContent=who+" is typing…";setTimeout(()=>{if($("typing").textContent){$("typing").textContent=""}},1500)}
const REASONS=["Harassment or bullying","Hate or discrimination","Threats or violence","Sexual content","Spam or scams","Something else"];
let rep=null;
REASONS.forEach(r=>{const l=document.createElement("label");l.className="opt";const i=document.createElement("input");i.type="radio";i.name="reason";i.value=r;i.onchange=chk;l.append(i,r);$("rreasons").append(l)});
function chk(){const r=document.querySelector('input[name=reason]:checked');const n=$("rdesc").value.trim().length;
 $("rhint").textContent=n<20?"Add at least "+(20-n)+" more characters so admins can review this fairly.":"Admins will read this alongside the message. Reports with no real violation are dismissed, and repeated false reports can lead to a warning.";
 $("rgo").disabled=!(r&&n>=20)}
function openReport(n,t){rep={n,t};$("rwho").textContent=n+" wrote:";$("rtxt").textContent=t;$("rdesc").value="";$("rblock").checked=false;document.querySelectorAll('input[name=reason]').forEach(x=>x.checked=false);chk();$("ov").classList.add("on");$("rreasons").querySelector("input").focus()}
function closeReport(){$("ov").classList.remove("on")}
$("rdesc").oninput=chk;$("rcancel").onclick=closeReport;$("ov").onclick=e=>{if(e.target===$("ov"))closeReport()};
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeReport()});
$("rgo").onclick=()=>{const b=$("rblock").checked;closeReport();toast(b?"Report sent and "+rep.n+" blocked":"Report sent to group admins")};
$("send").onclick=send;$("inp").onkeydown=e=>{if(e.key==="Enter")send()};
const A=$("app");
$("navbtn").onclick=()=>document.body.classList.toggle("show-left");
$("membtn").onclick=()=>document.body.classList.toggle("show-mem");
$("scrim").onclick=()=>document.body.classList.remove("show-left","show-mem");
$("theme").onclick=()=>{const r=document.documentElement;const l=r.dataset.theme==="light";r.dataset.theme=l?"dark":"light";$("theme").textContent=l?"Light mode":"Dark mode"};
draw();
