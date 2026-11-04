import { supabase } from "./supabase.js";

async function applyProfile(session) {
  const user = session && session.user;
  if (!user) return;
  const { data, error } = await supabase
    .from("profiles")
    .select("username,color")
    .eq("id", user.id)
    .single();
  if (error || !data) return;
  const me = document.querySelector(".me");
  const av = me.querySelector(".av");
  av.textContent = data.username[0].toUpperCase();
  av.style.background = data.color;
  for (const n of me.childNodes) {
    if (n.nodeType === 3 && n.nodeValue.trim()) n.nodeValue = data.username;
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => applyProfile(session), 0);
});
supabase.auth.getSession().then(({ data }) => applyProfile(data.session));