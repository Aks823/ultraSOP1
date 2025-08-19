// /assets/app.js — ESM in the browser
// Single top-level import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------- Supabase boot ----------
const SB_URL  = window.ENV?.SUPABASE_URL || window.SUPABASE_URL || '';
const SB_ANON = window.ENV?.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || '';

export const supabase =
  SB_URL && SB_ANON
    ? createClient(SB_URL, SB_ANON, {
        auth: { persistSession: true, storage: window.localStorage },
      })
    : null;

if (supabase) {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) console.error('[Supabase] error:', error);
    else       console.log('[Supabase] OK, session:', data.session);
  });
} else {
  console.warn('[Supabase] Missing ENV vars. Check window.ENV in index.html');
}

// ---------- Small utils ----------
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const toast = (m) => { const el = $("#toast"); if (!el) return; el.textContent = m; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 1600); };
const makeId = () => 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const setLoading = (on, txt) => {
  const ov = $("#overlay");      if (ov) ov.classList.toggle("show", !!on);
  const t  = $("#overlay-text"); if (t) t.textContent = txt || "Working…";
  const btn= $("#gen-run");      if (btn) btn.disabled = !!on;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// localStorage keys
const LS_LAST_SOP = 'ultrasop:last_row_id';
const LS_AI_DETAIL= 'ultrasop:ai_detail';   // 'preview' | 'pro'
const LS_AI_TONE  = 'ultrasop:ai_tone';     // 'neutral' | 'formal' | 'friendly'

// ---------- App state ----------
let sops   = [];   // array of in-memory editors
let active = null; // active in-memory editor id
let _session = null;

// ---------- Auth helpers ----------
async function getUser(){
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}
async function requireAuth(){
  const u = await getUser();
  if (!u) toast('Please sign in to save');
  return u;
}

// ---------- Data helpers ----------
async function upsertSopRow(sop){
  if (!supabase) return null;
  const user = await requireAuth(); if (!user) return null;

  const row = {
    id: sop._row_id || undefined,
    user_id: user.id,
    title:   sop.title   || '',
    summary: sop.summary || '',
    steps:   Array.isArray(sop.steps) ? sop.steps : [],
  };

  if (!sop._row_id){
    const { data, error } = await supabase.from('sops').insert(row).select('id, updated_at').single();
    if (error) throw error;
    sop._row_id = data.id;
  } else {
    const { error } = await supabase.from('sops').update(row).eq('id', sop._row_id);
    if (error) throw error;
  }
  // remember last opened DB row so we can restore after refresh/sign-in
  try{ localStorage.setItem(LS_LAST_SOP, sop._row_id); }catch{}
  return sop._row_id;
}

async function insertVersionRow(sop, notes){
  if (!supabase) return null;
  const user = await requireAuth(); if (!user) return null;

  const sop_id = await upsertSopRow(sop);

  // next n
  let nextN = 1;
  const { data:last } = await supabase
    .from('sop_versions')
    .select('n')
    .eq('sop_id', sop_id)
    .order('n', { ascending:false })
    .limit(1)
    .maybeSingle();
  if (last && typeof last.n === 'number') nextN = last.n + 1;

  const payload = {
    sop_id, user_id: user.id, n: nextN,
    title: sop.title || '', summary: sop.summary || '', steps: Array.isArray(sop.steps) ? sop.steps : [],
    notes: notes || ''
  };
  const { error } = await supabase.from('sop_versions').insert(payload);
  if (error) throw error;
  return nextN;
}

// Debounced draft saving (title/summary/steps edits)
let _saveTimer = null;
function scheduleDraftSave(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const sop = active ? sops.find(s=>s.id===active) : null;
    if (!sop) return;
    try { await upsertSopRow(sop); $("#autosave") && ($("#autosave").textContent = "Saved"); }
    catch(e){ console.warn('Draft save failed', e); $("#autosave") && ($("#autosave").textContent = "Save failed"); }
  }, 600);
}

// ---------- Auth UI ----------
function openAuth(){
  const m = document.getElementById('auth-modal'); if (!m) return;
  document.getElementById('auth-err')?.style && (document.getElementById('auth-err').style.display='none');
  m.classList.add('show'); m.setAttribute('aria-hidden','false');
  setTimeout(()=>document.getElementById('btn-auth-google')?.focus(), 20);
}
function closeAuth(){
  const m = document.getElementById('auth-modal'); if (!m) return;
  m.classList.remove('show'); m.setAttribute('aria-hidden','true');
}
async function updateAuthUI(session){
  _session = session || null;

  const btn = document.getElementById('nav-signin');
  if (btn){
    if (_session){
      btn.textContent = 'Sign out';
      btn.onclick = async () => { try{ await supabase.auth.signOut(); }catch{} };
    } else {
      btn.textContent = 'Sign in';
      btn.onclick = () => openAuth();
    }
  }

  // list + last-open behavior
  await renderMySops();
  if (_session){
    // restore the last opened SOP or open most recent one
    await tryRestoreLastOpen();
  } else {
    // redact the editor on sign-out
    resetEditorUI();
  }
}

// OAuth buttons
(function bindAuthModal(){
  $('#auth-close')?.addEventListener('click', closeAuth);
  $('#auth-cancel')?.addEventListener('click', closeAuth);

  $('#btn-auth-google')?.addEventListener('click', async () => {
    try{
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
      if (error) throw error; closeAuth();
    }catch(err){
      const box = $('#auth-err'); if (box){ box.style.display='block'; box.textContent = 'Google sign-in failed: ' + (err.message||'Unknown'); }
    }
  });
  $('#btn-auth-github')?.addEventListener('click', async () => {
    try{
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } });
      if (error) throw error; closeAuth();
    }catch(err){
      const box = $('#auth-err'); if (box){ box.style.display='block'; box.textContent = 'GitHub sign-in failed: ' + (err.message||'Unknown'); }
    }
  });
})();

// Initialize session + listen for changes
(async () => {
  try{
    const { data } = await supabase?.auth.getSession() || {};
    await updateAuthUI(data?.session || null);
    supabase?.auth.onAuthStateChange((_evt, sess) => updateAuthUI(sess));
  }catch(e){
    console.warn('Auth init error', e);
  }
})();

// ---------- Basic UI niceties ----------
const yearEl = $("#year"); if (yearEl) yearEl.textContent = new Date().getFullYear();
$("#nav-get")?.addEventListener("click", () => $("#app")?.scrollIntoView({ behavior:"smooth" }));
$("#hero-try")?.addEventListener("click", () => { $("#app")?.scrollIntoView({ behavior:"smooth" }); setTimeout(() => $("#sop-title")?.focus(), 350); });
$("#hero-learn")?.addEventListener("click", () => $("#faq")?.scrollIntoView({ behavior:"smooth" }));

// Tabs
$$(".tabbtn").forEach((b) => {
  b.onclick = () => {
    $$(".tabbtn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    $$(".tab").forEach((t) => t.classList.remove("visible"));
    $("#tab-" + b.dataset.tab)?.classList.add("visible");
    if (b.dataset.tab === "versions") renderVersions();
  };
});

// Generate modal
const modal = $("#gen-modal");
function openGen(){ if (!modal) return; modal.classList.add("show"); modal.setAttribute("aria-hidden","false"); $("#errbox")?.style && ($("#errbox").style.display="none"); $("#gen-input")?.focus(); }
function closeGen(){ if (!modal) return; modal.classList.remove("show"); modal.setAttribute("aria-hidden","true"); }
window.openGen = openGen; window.closeGen = closeGen;
(function bindModalButtons(){ $("#btn-open-modal")?.addEventListener("click", openGen); $("#gen-close")?.addEventListener("click", closeGen); $("#gen-cancel")?.addEventListener("click", closeGen); })();

$$(".segbtn").forEach((b) => b.addEventListener("click", () => {
  $$(".segbtn").forEach((x)=>x.classList.remove("active"));
  b.classList.add("active");
  const which = b.dataset.panel;
  $("#panel-text") && ($("#panel-text").style.display  = which==="text"  ? "block" : "none");
  $("#panel-audio")&& ($("#panel-audio").style.display = which==="audio" ? "block" : "none");
}));

$("#btn-sample")?.addEventListener("click", () => {
  const el = $("#gen
