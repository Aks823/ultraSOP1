// /assets/app.js  — ESM in the browser
// Use ONE import at top level (no imports inside functions)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Read keys that you set in index.html (window.ENV)
const SB_URL  = window.ENV?.SUPABASE_URL || window.SUPABASE_URL || '';
const SB_ANON = window.ENV?.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || '';

export const supabase =
  SB_URL && SB_ANON
    ? createClient(SB_URL, SB_ANON, {
        auth: { persistSession: true, storage: window.localStorage },
      })
    : null;

// Optional: quick smoke test (won't run if not configured)
if (supabase) {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) console.error('[Supabase] error:', error);
    else       console.log('[Supabase] OK, session:', data.session);
  });
} else {
  console.warn('[Supabase] Missing ENV vars. Check window.ENV in index.html');
}


  // ===== Helpers =====
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const toast = (m) => {
    const el = $("#toast"); if (!el) return;
    el.textContent = m; el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1600);
  };
  const makeId = () => 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const setLoading = (on, txt) => {
    const ov = $("#overlay"); if (ov) ov.classList.toggle("show", !!on);
    const t  = $("#overlay-text"); if (t) t.textContent = txt || "Working…";
    const btn = $("#gen-run"); if (btn) btn.disabled = !!on;
  };

  // --- Supabase helpers ---
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

// Create/update a row in public.sops and return its id
async function upsertSopRow(sop){
  if (!supabase) return null;
  const user = await requireAuth(); if (!user) return null;

  const row = {
    id: sop._row_id || undefined,     // keep DB id on the SOP object
    user_id: user.id,
    title:   sop.title   || '',
    summary: sop.summary || '',
    steps:   sop.steps   || []
  };

  if (!sop._row_id){
    const { data, error } = await supabase.from('sops').insert(row).select('id').single();
    if (error) throw error;
    sop._row_id = data.id;
  } else {
    const { error } = await supabase.from('sops').update(row).eq('id', sop._row_id);
    if (error) throw error;
  }
    try{ localStorage.setItem(lastOpenKey(), String(sop._row_id)); }catch(e){}
  return sop._row_id;
}

// Insert a version in public.sop_versions and return the version number
async function insertVersionRow(sop, notes){
  if (!supabase) return null;
  const user = await requireAuth(); if (!user) return null;

  const sop_id = await upsertSopRow(sop);

  // find last version number
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
    sop_id,
    user_id: user.id,
    n: nextN,
    title:   sop.title   || '',
    summary: sop.summary || '',
    steps:   sop.steps   || [],
    notes:   notes || ''
  };
  const { error } = await supabase.from('sop_versions').insert(payload);
  if (error) throw error;
  return nextN;
}

  // Use the same client everywhere
const supa = supabase;
if (!supa) { console.warn('Supabase not configured; auth will be disabled.'); }


if (!supa) { console.warn('Supabase not available yet. Check index.html tags.'); }

// Keep the current session around for UI toggles
let _session = null;

// Small helper to show/hide the auth modal
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

// Update the top-right button text/behavior based on auth state
async function updateAuthUI(session){
  _session = session || null;
  const btn = document.getElementById('nav-signin');
  if (!btn) return;

  if (_session){
    // Signed in
    btn.textContent = 'Sign out';
    btn.onclick = async () => { try{ await supa.auth.signOut(); }catch(e){} };

    // Refresh left panel + try to open last SOP for this user
    renderMySops();
    openLastIfAny();

    // If nothing open and no draft for this user, try to load a draft
    if (!active) tryLoadDraft();
  } else {
    // Signed out
    btn.textContent = 'Sign in';
    btn.onclick = () => openAuth();

    // Clear in-memory + UI (avoid showing previous user’s data)
    sops = []; active = null;
    try{ localStorage.removeItem(draftKey()); }catch(e){}

    const t  = document.getElementById('sop-title');    if (t)  t.value = '';
    const s  = document.getElementById('sop-summary');  if (s)  s.value = '';
    const ul = document.getElementById('steps-list');   if (ul) ul.innerHTML = '';
    const pv = document.getElementById('preview');      if (pv) pv.innerHTML = '';
    const jb = document.getElementById('jsonbox');      if (jb) jb.textContent = '';
    const vl = document.getElementById('versions-list');if (vl) vl.innerHTML = '';

    renderMySops();
    document.querySelector('[data-tab="editor"]')?.click();
  }
}

// Bind modal buttons
(function bindAuthModal(){
  document.getElementById('auth-close')?.addEventListener('click', closeAuth);
  document.getElementById('auth-cancel')?.addEventListener('click', closeAuth);

  // OAuth buttons (will work after you enable the providers in Supabase — that’s Step F.3)
  document.getElementById('btn-auth-google')?.addEventListener('click', async () => {
    if (!supa) return;
    try{
      const { error } = await supa.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
      // Supabase will handle the redirect. We close for now.
      closeAuth();
    }catch(err){
      const box = document.getElementById('auth-err');
      if (box){ box.style.display='block'; box.textContent = 'Google sign-in failed: ' + (err.message || 'Unknown'); }
    }
  });

  document.getElementById('btn-auth-github')?.addEventListener('click', async () => {
    if (!supa) return;
    try{
      const { error } = await supa.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
      closeAuth();
    }catch(err){
      const box = document.getElementById('auth-err');
      if (box){ box.style.display='block'; box.textContent = 'GitHub sign-in failed: ' + (err.message || 'Unknown'); }
    }
  });
})();

// Initialize session + listen for changes
(async () => {
  try{
    const { data } = await supa?.auth.getSession() || {};
    await updateAuthUI(data?.session || null);
    supa?.auth.onAuthStateChange((_evt, sess) => updateAuthUI(sess));
    renderMySops();
  }catch(e){
    console.warn('Auth init error', e);
  }
})();

  // Footer year
  const yearEl = $("#year"); if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Smooth scroll buttons
  $("#nav-get")?.addEventListener("click", () => $("#app")?.scrollIntoView({ behavior:"smooth" }));
  $("#hero-try")?.addEventListener("click", () => {
    $("#app")?.scrollIntoView({ behavior:"smooth" });
    setTimeout(() => $("#sop-title")?.focus(), 350);
  });
  $("#hero-learn")?.addEventListener("click", () => $("#faq")?.scrollIntoView({ behavior:"smooth" }));

  // ===== Tabs =====
  $$(".tabbtn").forEach((b) => {
    b.onclick = () => {
      $$(".tabbtn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      $$(".tab").forEach((t) => t.classList.remove("visible"));
      $("#tab-" + b.dataset.tab)?.classList.add("visible");
      if (b.dataset.tab === "versions") renderVersions();
    };
  });

  // ===== Generate modal (Text/Audio) =====
  const modal = $("#gen-modal");
  function openGen(){ if (!modal) return; modal.classList.add("show"); modal.setAttribute("aria-hidden","false"); $("#errbox")?.style && ($("#errbox").style.display="none"); $("#gen-input")?.focus(); }
  function closeGen(){ if (!modal) return; modal.classList.remove("show"); modal.setAttribute("aria-hidden","true"); }
  window.openGen  = openGen;
  window.closeGen = closeGen;

  (function bindModalButtons(){
    $("#btn-open-modal")?.addEventListener("click", openGen);
    $("#gen-close")?.addEventListener("click", closeGen);
    $("#gen-cancel")?.addEventListener("click", closeGen);
  })();

  $$(".segbtn").forEach((b) => b.addEventListener("click", () => {
    $$(".segbtn").forEach((x)=>x.classList.remove("active"));
    b.classList.add("active");
    const which = b.dataset.panel;
    $("#panel-text") && ($("#panel-text").style.display  = which==="text"  ? "block" : "none");
    $("#panel-audio")&& ($("#panel-audio").style.display = which==="audio" ? "block" : "none");
  }));

  $("#btn-sample")?.addEventListener("click", () => {
    const el = $("#gen-input"); if (!el) return;
    el.value = "Title: Google Ads weekly routine\n1) Review search terms and add negatives\n2) Rebalance budgets based on CPA\n3) Refresh ad copy tests\n4) Export report and email client\n5) Log changes in Notion";
  });

  // ===== State =====
  let sops   = [];
  let active = null;

// --- Local draft persistence (per-user) --------------------
let _draftTimer = null;
function draftKey(){
  const uid = _session?.user?.id || 'anon';
  return 'ultrasop:draft:' + uid;
}
function lastOpenKey(){
  const uid = _session?.user?.id || 'anon';
  return 'ultrasop:last:' + uid;
}
function scheduleDraftSave(){
  if (_draftTimer) clearTimeout(_draftTimer);
  _draftTimer = setTimeout(() => {
    const sop = active ? sops.find(s => s.id === active) : null;
    if (!sop) return;
    try{
      localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), sop }));
      if (sop._row_id) localStorage.setItem(lastOpenKey(), String(sop._row_id));
    }catch(e){}
  }, 250);
}
function tryLoadDraft(){
  try{
    const raw = localStorage.getItem(draftKey()); if (!raw) return false;
    const obj = JSON.parse(raw); if (!obj?.sop) return false;
    const sop = obj.sop;
    sop.id = makeId();           // new in-memory id
    sops.unshift(sop); active = sop.id;
    renderEditor(); renderVersions();
    return true;
  }catch(e){ return false; }
}
async function openLastIfAny(){
  const rowId = localStorage.getItem(lastOpenKey());
  if (!rowId || !supabase) return;
  try{ await openSopByRowId(rowId); }catch(e){}
}

  /* === Clear All modal logic === */
let _clearBusy = false;

function openClear(){
  const m = document.getElementById('clear-modal'); if(!m) return;
  m.classList.add('show');
  m.setAttribute('aria-hidden','false');
  // focus the confirm for quick keyboard action
  setTimeout(()=>document.getElementById('clear-confirm')?.focus(), 20);
}
function closeClear(){
  const m = document.getElementById('clear-modal'); if(!m) return;
  m.classList.remove('show');
  m.setAttribute('aria-hidden','true');
}

function clearAllNow(){
  // Only clear the CURRENT SOP fields; keep DB row, versions, and working set intact.
  const sop = active ? sops.find(s => s.id === active) : null;

  // UI
  const t  = document.getElementById('sop-title');    if (t)  t.value = '';
  const s  = document.getElementById('sop-summary');  if (s)  s.value = '';
  const ul = document.getElementById('steps-list');   if (ul) ul.innerHTML = '';
  const pv = document.getElementById('preview');      if (pv) pv.innerHTML = '';
  const jb = document.getElementById('jsonbox');      if (jb) jb.textContent = '';

  // In-memory draft for the active SOP
  if (sop){
    sop.title   = '';
    sop.summary = '';
    sop.steps   = [];
    scheduleDraftSave(); // persist the cleared draft (but keep versions)
  }

  toast('Cleared (versions preserved)');
}

(function(){
  const btnOpen = document.getElementById('btn-clear');
  const btnX    = document.getElementById('clear-close');
  const btnCancel = document.getElementById('clear-cancel');
  const btnYes  = document.getElementById('clear-confirm');
   
  // Remove any legacy top-bar button if an old bundle injected it
  document.getElementById('btn-clear-all')?.remove();

  if (btnOpen)   btnOpen.addEventListener('click', openClear);
  if (btnX)      btnX.addEventListener('click', closeClear);
  if (btnCancel) btnCancel.addEventListener('click', closeClear);

  if (btnYes) btnYes.addEventListener('click', ()=>{
    if (_clearBusy) return;               // single-click guard
    _clearBusy = true;
    try{
      clearAllNow();
      closeClear();
    } finally {
      _clearBusy = false;
    }
  });
})();

  // ===== Rendering =====
  function renderEditor(){
    if (!active) return;
    const sop = sops.find(s => s.id === active); if (!sop) return;

    const titleEl = $("#sop-title");   if (titleEl) titleEl.value = sop.title   || "";
    const sumEl   = $("#sop-summary"); if (sumEl)   sumEl.value   = sop.summary || "";

    const ul = $("#steps-list"); if (!ul) return;
    ul.innerHTML = "";

    (sop.steps || []).forEach((st, i) => {
      const li = document.createElement("li");
      li.className = "steprow";

      const isObj = typeof st === "object";
      const title = isObj ? (st.title || "") : (st || "");
      const hasOwner = isObj && st.ownerRole && st.ownerRole.trim() !== "";
      const hasDur   = isObj && (st.durationMin || st.durationMin === 0);

      li.innerHTML =
        '<span class="stepnum">'+(i+1)+'</span>' +
        '<div style="display:grid;gap:6px">' +
          '<input class="input step-title" value="'+title.replace(/"/g,'&quot;')+'"/>' +
          '<div class="ownergroup'+(hasOwner ? ' show':'')+'" data-idx="'+i+'">' +
            '<input class="input step-owner" placeholder="Owner role (optional)" value="'+(hasOwner ? st.ownerRole.replace(/"/g,'&quot;') : '')+'" style="max-width:240px" />' +
          '</div>' +
          '<div class="durgroup'+(hasDur ? ' show':'')+'" data-idx="'+i+'">' +
            '<input class="input step-duration" type="number" min="0" placeholder="Duration (min)" value="'+(hasDur ? st.durationMin : '')+'" style="max-width:160px" />' +
          '</div>' +
          '<textarea class="textarea step-details" data-idx="'+i+'" placeholder="Details (optional)" style="display:'+(isObj && st.details ? 'block' : 'none')+'">'+(isObj && st.details ? String(st.details).replace(/</g,"&lt;") : "")+'</textarea>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
          '<button class="btn chipbtn'+(hasOwner?' active':'')+'" data-owner="'+i+'">Owner</button>' +
          '<button class="btn chipbtn'+(hasDur?' active':'')+'" data-duration="'+i+'">Duration</button>' +
          '<button class="btn" data-up="'+i+'">↑</button>' +
          '<button class="btn" data-down="'+i+'">↓</button>' +
          '<button class="btn" data-more="'+i+'">More</button>' +
          '<button class="btn" data-rm="'+i+'">✕</button>' +
        '</div>';

      // Pre-fill fields
      if (isObj) {
        const ta = li.querySelector('.step-details'); if (st.details && ta){ ta.style.display = "block"; ta.value = st.details; }
        const ownerEl = li.querySelector('.step-owner'); if (ownerEl && st.ownerRole) ownerEl.value = st.ownerRole;
        const durEl   = li.querySelector('.step-duration'); if (durEl && (st.durationMin || st.durationMin === 0)) durEl.value = st.durationMin;
      }
      ul.appendChild(li);
    });

    // Title edits
    ul.querySelectorAll(".step-title").forEach((inp, idx) => {
      inp.oninput = (e) => {
        const txt = e.target.value;
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = txt;
        else sop.steps[idx].title = txt;
        renderPreview(sop); renderJSON(sop);
      };
    });

    // Toggle details
    ul.querySelectorAll("[data-more]").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-more"), 10);
        const ta  = ul.querySelector('.step-details[data-idx="'+idx+'"]');
        if (!ta) return;
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details: "" };
        ta.style.display = (ta.style.display === "none" || !ta.style.display) ? "block" : "none";
      };
    });

    // Details input
    ul.querySelectorAll(".step-details").forEach((ta) => {
      ta.oninput = (e) => {
        const idx = parseInt(ta.getAttribute("data-idx"), 10);
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details: "" };
        sop.steps[idx].details = e.target.value;
        renderPreview(sop); renderJSON(sop);
      };
    });

    // Remove / Move
    ul.querySelectorAll("[data-rm]").forEach((btn) => {
      btn.onclick = () => { const idx = parseInt(btn.dataset.rm, 10); sop.steps.splice(idx,1); renderEditor(); renderPreview(sop); renderJSON(sop); };
    });
    ul.querySelectorAll("[data-up]").forEach((btn) => {
      btn.onclick = () => { const idx = parseInt(btn.dataset.up, 10); if (idx <= 0) return;
        [sop.steps[idx-1], sop.steps[idx]] = [sop.steps[idx], sop.steps[idx-1]];
        renderEditor(); renderPreview(sop); renderJSON(sop);
      };
    });
    ul.querySelectorAll("[data-down]").forEach((btn) => {
      btn.onclick = () => { const idx = parseInt(btn.dataset.down, 10); if (idx >= sop.steps.length-1) return;
        [sop.steps[idx], sop.steps[idx+1]] = [sop.steps[idx+1], sop.steps[idx]];
        renderEditor(); renderPreview(sop); renderJSON(sop);
      };
    });

    // Owner toggle/input
    ul.querySelectorAll("[data-owner]").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-owner"), 10);
        const group = ul.querySelector('.ownergroup[data-idx="'+idx+'"]');
        if (!group) return;
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details:"", ownerRole:"" };
        const showing = group.classList.toggle("show");
        btn.classList.toggle("active", showing);
        if (!showing) {
          sop.steps[idx].ownerRole = "";
          const input = group.querySelector('.step-owner'); if (input) input.value = "";
        }
        renderPreview(sop); renderJSON(sop);
      };
    });
    ul.querySelectorAll(".step-owner").forEach((inp) => {
      inp.oninput = (e) => {
        const idx = parseInt(inp.closest(".ownergroup").getAttribute("data-idx"), 10);
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details:"", ownerRole:"" };
        sop.steps[idx].ownerRole = e.target.value;
        renderPreview(sop); renderJSON(sop);
      };
    });

    // Duration toggle/input
    ul.querySelectorAll("[data-duration]").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-duration"), 10);
        const group = ul.querySelector('.durgroup[data-idx="'+idx+'"]');
        if (!group) return;
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details:"", durationMin:null };
        const showing = group.classList.toggle("show");
        btn.classList.toggle("active", showing);
        if (!showing) {
          sop.steps[idx].durationMin = null;
          const input = group.querySelector('.step-duration'); if (input) input.value = "";
        }
        renderPreview(sop); renderJSON(sop);
      };
    });
    ul.querySelectorAll(".step-duration").forEach((inp) => {
      inp.oninput = (e) => {
        const idx = parseInt(inp.closest(".durgroup").getAttribute("data-idx"), 10);
        const val = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value,10) || 0);
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details:"", durationMin:null };
        sop.steps[idx].durationMin = val;
        renderPreview(sop); renderJSON(sop);
      };
    });

    // Add Step
    const addBtn = $("#btn-add-step");
    if (addBtn) {
      addBtn.onclick = () => {
        const cur = sops.find(s => s.id === active); if (!cur) return;
        cur.steps = cur.steps || [];
        cur.steps.push({ title: "New step" });
        renderEditor(); renderPreview(cur); renderJSON(cur);
        $("#steps-list .steprow:last-child")?.scrollIntoView({ behavior:"smooth", block:"center" });
      };
    }

    // Title/Summary inputs
    $("#sop-title").oninput   = (e) => { sop.title   = e.target.value; renderPreview(sop); renderJSON(sop); };
    $("#sop-summary").oninput = (e) => { sop.summary = e.target.value; renderPreview(sop); renderJSON(sop); };

    renderPreview(sop); renderJSON(sop);
  }

  function renderPreview(sop){
    const steps = (sop.steps || []).map((st, i) => {
      const t = typeof st === "string" ? st : (st.title || "");
      const owner = (typeof st === "object" && st.ownerRole) ? st.ownerRole : "";
      const dur   = (typeof st === "object" && (st.durationMin || st.durationMin === 0)) ? st.durationMin : "";
      const details = (typeof st === "object" && st.details) ? st.details : "";
      const meta = [owner ? `Owner: ${owner}` : "", (dur !== "" ? `Duration: ${dur} min` : "")]
        .filter(Boolean).join(" · ");
      return '<div style="border:1px dashed #ffd9b7;background:#fff;border-radius:12px;padding:10px;margin-bottom:8px">'
        + '<strong>Step '+(i+1)+':</strong> ' + t
        + (meta ? '<div class="muted" style="font-size:12px;margin-top:4px">'+meta+'</div>' : '')
        + (details ? '<div style="margin-top:6px">'+String(details).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>' : '')
        + '</div>';
    }).join("");
    const prev = $("#preview");
    if (prev) {
      prev.innerHTML = '<h4 style="margin:0 0 6px">'+(sop.title||"Untitled SOP")+'</h4>'
        + '<p class="muted" style="margin:0 0 10px">'+(sop.summary||"")+'</p>' + steps;
          scheduleDraftSave();
    }
  }

  function renderJSON(sop){
    const jb = $("#jsonbox");
    if (jb) jb.textContent = JSON.stringify(sop, null, 2);
  }

async function renderVersions(){
  if (!active) return;
  const sop  = sops.find(s => s.id === active); if (!sop) return;
  const list = $("#versions-list"); if (!list) return;

  // Start with whatever we have locally
  let versions = Array.isArray(sop.versions) ? sop.versions.slice() : [];

  // Try the server if logged in and this SOP has a DB row
  try{
    if (supabase){
      const { data:{ user } } = await supabase.auth.getUser();
      if (user && sop._row_id){
        const { data, error } = await supabase
          .from('sop_versions')
          .select('n, created_at, title, summary, notes')
          .eq('sop_id', sop._row_id)
          .order('n', { ascending: false });
        if (!error && Array.isArray(data)){
          versions = data.map(v => ({
            n: v.n,
            at: v.created_at,
            title: v.title,
            summary: v.summary,
            notes: v.notes || ''
          }));
          sop.versions = versions.slice(); // cache in memory for the UI
        }
      }
    }
  }catch(e){ console.warn('versions fetch:', e); }

  list.innerHTML = "";
  if (!versions.length){
    list.innerHTML = '<div class="card"><strong>No versions yet.</strong><p class="muted">Click "Save Version" in the top bar to snapshot this SOP.</p></div>';
    return;
  }

  versions.forEach((v) => {
    const safeNotes = v.notes && String(v.notes).trim()
      ? String(v.notes).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      : '';
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
        '<div><strong>v'+v.n+'</strong> · '+ new Date(v.at).toLocaleString() +'</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<span class="muted" style="font-size:12px">'+(v.title||"")+'</span>' +
          '<button class="btn" data-restore="'+v.n+'">Restore</button>' +
        '</div>' +
      '</div>' +
      (safeNotes ? '<div class="muted" style="font-size:12px;margin-top:6px">Notes: '+ safeNotes +'</div>' : '');
    list.appendChild(el);
  });
}

// --- Topbar search (suggest + open) ---------------------------------
(function initSearch(){
  const input = document.querySelector('.topbar .search');
  if (!input) return;
  let box = null;
  function ensureBox(){
    if (box) return box;
    box = document.createElement('div');
    box.id = 'search-suggest';
    box.style.cssText = 'position:absolute;top:46px;left:0;right:0;background:#fff;border:1px solid #E5E7EB;border-radius:10px;box-shadow:0 10px 26px rgba(15,23,42,.08);padding:6px;display:none;z-index:30';
    const holder = input.parentElement; holder.style.position = 'relative';
    holder.appendChild(box);
    return box;
  }
  async function run(q){
    if (!supabase || !_session?.user?.id) return;
    const { data, error } = await supabase
      .from('sops')
      .select('id,title,updated_at')
      .eq('user_id', _session.user.id)
      .ilike('title', `%${q}%`)
      .order('updated_at', { ascending:false })
      .limit(8);
    const rows = error ? [] : (data||[]);
    const b = ensureBox();
    if (!rows.length){ b.style.display='none'; b.innerHTML=''; return; }
    b.innerHTML = rows.map(r=>`<button class="qtpl-btn" data-open-sop="${r.id}" style="width:100%; text-align:left">${(r.title||'Untitled SOP')}</button>`).join('');
    b.style.display='block';
  }
  input.addEventListener('input', (e)=>{
    const q = String(e.target.value||'').trim();
    if (q.length < 2){ if (box){ box.style.display='none'; box.innerHTML=''; } return; }
    run(q);
  });
  document.addEventListener('click', (e)=>{
    if (!box) return;
    if (e.target === input) return;
    if (!box.contains(e.target)) box.style.display='none';
  });
})();

/* === UltraSOP PDF v2 helpers — add once === */
function makePdfHelpers(doc) {
  const M = 56;                    // page margin (pt)
  let y = M;                       // current cursor
  const lh = 16;                   // base line height

  const color = {
    text:  [17, 24, 39],
    muted: [107,114,128],
    brand: [255,122,26],

    chip:       [255,244,237],     // soft orange fill
    chipBorder: [255,196,156],

    riskBg:     [254,242,242],     // soft red
    riskBorder: [254,202,202],

    checkBg:    [255,247,240],     // soft orange-ish
    checkBorder:[255,217,191],

    accBg:      [240,253,244],     // soft green
    accBorder:  [209,250,229],

    border:     [229,231,235]
  };

  const page = () => ({
    w: doc.internal.pageSize.getWidth(),
    h: doc.internal.pageSize.getHeight()
  });

  const ensure = (need) => {
    const { h } = page();
    if (y + need > h - M) { doc.addPage(); y = M; }
  };

  const setY = (v) => { y = v; };
  const yRef = () => y;

  const text = (str, opt = {}) => {
    const { w } = page();
    doc.setFont('helvetica', opt.bold ? 'bold' : 'normal');
    doc.setFontSize(opt.size || 12);
    doc.setTextColor(...(opt.color || color.text));
    const lines = doc.splitTextToSize(String(str || ''), opt.maxWidth || (w - M*2));
    lines.forEach(l => { ensure(lh); doc.text(l, M, y); y += lh; });
    return lines;
  };

  const rule = () => {
    const { w } = page();
    ensure(10);
    doc.setDrawColor(...color.border);
    doc.setLineWidth(0.7);
    doc.line(M, y, w - M, y);
    y += 8;
  };

  const h1 = (t) => { doc.setFont('helvetica','bold'); doc.setFontSize(22); doc.setTextColor(...color.text); ensure(lh); doc.text(String(t||''), M, y); y += 20; };
  const h2 = (t) => { doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...color.text); ensure(lh); doc.text(String(t||''), M, y); y += 12; };

  // simple row of badges (call multiple times; then call badgesDone() to move to next line)
  let _x = null;
  const badgesReset = () => { _x = null; };
  const badge = (label, value, variant='default') => {
    if (value == null || value === '') return;
    const { w } = page();
    const padX = 6, padY = 5, r = 4;
    doc.setFont('helvetica','bold'); doc.setFontSize(10);

    const txt = `${label}: ${value}`;
    const tw = doc.getTextWidth(txt);
    const bw = tw + padX*2, bh = 14;

    ensure(bh + 4);
    const x = (_x ?? M);
    const fill   = (variant === 'duration') ? color.chip : [255,255,255];
    const border = (variant === 'duration') ? color.chipBorder : [209,213,219];

    doc.setDrawColor(...border); doc.setFillColor(...fill);
    if (doc.roundedRect) doc.roundedRect(x, y - 12, bw, bh, r, r, 'FD');
    else { doc.rect(x, y - 12, bw, bh, 'FD'); }

    doc.setTextColor(...color.text);
    doc.text(txt, x + padX, y - 2);

    _x = x + bw + 6;
  };
  const badgesDone = () => { if (_x != null) { y += 10; _x = null; } };

  // bullets (• or ☐)
  const bulletList = (items, marker = '•') => {
    if (!Array.isArray(items) || items.length === 0) return;
    const { w } = page();
    const mw = w - M*2 - 12;

    doc.setFont('helvetica','normal'); doc.setFontSize(12); doc.setTextColor(...color.text);
    items.forEach(it => {
      const lines = doc.splitTextToSize(String(it || ''), mw);
      ensure(lh * lines.length);
      doc.text(marker, M, y);
      lines.forEach((l, i) => { doc.text(l, M + 8, y + i*lh); });
      y += lh * lines.length;
    });
    y += 2;
  };

  // labelled box (Checklist, Risks, Acceptance, etc.)
  const callout = (label, payload, tint='check') => {
    const items = Array.isArray(payload) ? payload : (payload ? [String(payload)] : []);
    if (!items.length) return;

    const { w } = page();
    const bg  = tint === 'risk' ? color.riskBg : tint === 'acc' ? color.accBg : color.checkBg;
    const brd = tint === 'risk' ? color.riskBorder : tint === 'acc' ? color.accBorder : color.checkBorder;

    // measure content height
    const mw = w - M*2 - 12;
    let contentH = 0;
    const chunks = items.map(t => doc.splitTextToSize(String(t), mw));
    chunks.forEach(ls => contentH += ls.length * lh);

    const boxH = Math.max(24, contentH + 18);
    ensure(boxH + 6);
    doc.setDrawColor(...brd); doc.setFillColor(...bg);
    if (doc.roundedRect) doc.roundedRect(M, y, w - M*2, boxH, 5, 5, 'FD');
    else                 doc.rect(M, y, w - M*2, boxH, 'FD');

    // label
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...color.text);
    doc.text(String(label).toUpperCase(), M + 8, y + 12);

    // content
    doc.setFont('helvetica','normal'); doc.setFontSize(12);
    let yy = y + 18;
    chunks.forEach(ls => {
      ls.forEach(l => { doc.text(l, M + 8, yy); yy += lh; });
    });

    y = yy + 6;
  };

  // convert long paragraphs to scannable bullets (split by sentences)
  const paragraphToBullets = (txt) => {
    if (!txt) return;
    const parts = String(txt).split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean);
    bulletList(parts, '•');
  };

  return { M, page, ensure, setY, yRef, h1, h2, text, rule, badge, badgesDone, badgesReset, bulletList, callout, paragraphToBullets, color, lh };
}
// ===== PDF (structured v2) =====
$("#btn-download-pdf")?.addEventListener("click", () => {
  try{
    const sop = sops.find(s => s.id === active);
    if (!sop) { toast("No SOP open"); return; }

    const JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDF) { toast("PDF engine missing"); return; }
    const doc = new JsPDF({ unit:"pt", format:"a4" });
    const H = makePdfHelpers(doc);

    // Header bar
    const { w, h } = H.page();
    doc.setFillColor(255,122,26); doc.rect(0, 0, w, 36, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text('UltraSOP', H.M, 24);

    // Front matter
    H.setY(72);
    H.h1(sop.title || 'Untitled SOP');
    doc.setFont('helvetica','normal'); doc.setFontSize(12); doc.setTextColor(55,65,81);
    if (sop.summary) H.text(sop.summary, { color:[55,65,81] });

    // Meta badges (Owner/Total Duration/Updated)
    const totalMin = (Array.isArray(sop.steps) ? sop.steps : []).reduce((acc, st) => {
      const s = (st && typeof st === 'object') ? st : {};
      return acc + (typeof s.durationMin === 'number' ? s.durationMin : 0);
    }, 0);
    H.badgesReset();
    H.badge('Total Duration', (totalMin ? `${totalMin} min` : '—'), 'duration');
    H.badge('Last Updated', new Date().toLocaleDateString());
    H.badgesDone();

    H.rule();
    H.h2('Steps');

    // Collect references globally
    const refMap = new Map(); // text -> index
    const refs = [];

    const splitToBullets = (t) => String(t||'')
      .split(/\n+/)                     // newlines first
      .flatMap(s => s.split(/(?<=\.)\s+/))   // then sentences
      .map(s => s.trim())
      .filter(Boolean);

    (Array.isArray(sop.steps) ? sop.steps : []).forEach((raw, i) => {
      const s = (raw && typeof raw === 'object') ? raw : { title: String(raw||'') };

      // Step Heading
      H.h2(`Step ${i+1}: ${s.title || 'Untitled step'}`);

      // Badges (Owner / Duration)
      H.badgesReset();
      if (s.ownerRole) H.badge('Owner', s.ownerRole);
      if (s.durationMin === 0 || typeof s.durationMin === 'number') H.badge('Duration', `${s.durationMin} min`, 'duration');
      H.badgesDone();

      // Do this (from details → concise bullets)
      if (s.details) {
        H.bulletList(splitToBullets(s.details), '•');
      }

      // Long form (expanded guidance → bullets)
      if (s.longform) {
        H.paragraphToBullets(s.longform);
      }

      // Structured blocks
      if (Array.isArray(s.checklist) && s.checklist.length) {
        H.callout('Checklist', s.checklist, 'check');
      }
      if (Array.isArray(s.prerequisites) && s.prerequisites.length) {
        H.callout('Prerequisites', s.prerequisites, 'check');
      }
      if (Array.isArray(s.tools) && s.tools.length) {
        H.callout('Tools', s.tools, 'check');
      }
      if (Array.isArray(s.acceptanceCriteria) && s.acceptanceCriteria.length) {
        H.callout('Acceptance criteria', s.acceptanceCriteria, 'acc');
      }
      const risksPayload = (Array.isArray(s.risks) && s.risks.length) ? s.risks : (s.riskNotes || '');
      if (risksPayload && (Array.isArray(risksPayload) ? risksPayload.length : true)) {
        H.callout('Risks', risksPayload, 'risk');
      }

      // References: collect unique text across all steps
      if (Array.isArray(s.references)) {
        s.references.forEach((r) => {
          const key = String(r).trim();
          if (!key) return;
          if (!refMap.has(key)) { refMap.set(key, refs.length + 1); refs.push(key); }
        });
      }

      // Gentle spacing before next step
      H.setY(H.yRef() + 6);
    });

    // Totals & Role matrix
    H.rule();
    H.h2('Totals & Roles');

    // Roles -> steps table (compact)
    const roleMap = new Map();
    (Array.isArray(sop.steps) ? sop.steps : []).forEach((raw, i) => {
      const s = (raw && typeof raw === 'object') ? raw : {};
      const r = (s.ownerRole || '').trim();
      if (!r) return;
      if (!roleMap.has(r)) roleMap.set(r, []);
      roleMap.get(r).push(i+1);
    });

    const roleLines = [];
    roleMap.forEach((arr, role) => roleLines.push(`${role}: steps ${arr.join(', ')}`));
    if (!roleLines.length) roleLines.push('—');
    H.bulletList([`Estimated total: ${totalMin ? totalMin + ' min' : '—'}`, ...roleLines], '•');

    // References (deduped)
    if (refs.length) {
      H.rule(); H.h2('References');
      refs.forEach((r, idx) => { H.text(`[${idx+1}] ${r}`); });
    }

    // Footer with page X/Y + timestamp (keep your behavior)
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++){
      doc.setPage(p);
      const ph = doc.internal.pageSize.getHeight();
      const pw = doc.internal.pageSize.getWidth();
      doc.setFontSize(10); doc.setTextColor(107,114,128);
      doc.text(`Generated by UltraSOP — ${new Date().toLocaleString()}`, H.M, ph - 24);
      doc.text(`${p} / ${pages}`, pw - H.M, ph - 24, { align:'right' });
    }

    const fileName = (sop.title || 'UltraSOP')
      .replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()+'.pdf';
    doc.save(fileName);
    toast("PDF downloaded");
  } catch(e){
    console.error(e);
    toast('PDF export failed: ' + (e.message || 'Unknown'));
  }
});

  // ===== Functions endpoints =====
  async function callGenerateAPI(raw, overrideTitle){
    const res = await fetch('/.netlify/functions/generateSop', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ inputText: raw, overrideTitle: overrideTitle || "", detail: (window.__ULTRASOP_DETAIL || "full") })
    });
    const data = await res.json().catch(()=>({error:"Invalid server response"}));
    if (!res.ok) throw new Error(data?.error || ("HTTP "+res.status));
    return data.sop;
  }

  // ===== Modal "Generate" (paste notes) =====
  $("#gen-run")?.addEventListener("click", async () => {
    const raw = $("#gen-input")?.value.trim();
    if (!raw){ const e=$("#errbox"); if (e){ e.style.display="block"; e.textContent="Paste some text first."; } return; }
    $("#errbox") && ($("#errbox").style.display="none");

    closeGen();
    const t0 = performance.now();
    setLoading(true, "Generating…");

    const localFromNotes = (notes, overrideTitle) => {
      const lines = String(notes).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const bulletRx = /^(\d+[\.\)]\s+|[-*]\s+)/;
      let title = ($("#gen-title-in")?.value || overrideTitle || '').trim();
      if (!title) {
        const tLine = lines.find(l => /^title\s*:/i.test(l));
        title = tLine ? tLine.replace(/^title\s*:/i,'').trim() : (lines[0] || 'Untitled SOP');
      }
      const steps = lines.filter(l => bulletRx.test(l)).map(l => l.replace(bulletRx,'').trim());
      const summary = lines.filter(l => !bulletRx.test(l) && !/^title\s*:/i.test(l)).slice(0,3).join(' — ').slice(0,240);
      return { title, summary, steps: (steps.length ? steps : ['Plan the work','Perform the work','Review & finalize']).map(s => ({ title:s })) };
    };

    try{
      const sop = await callGenerateAPI(raw, $("#gen-title-in")?.value);
      $("#metrics") && ($("#metrics").textContent = "Generated in " + ((performance.now()-t0)/1000).toFixed(1) + "s");
      sop.id = makeId(); sops.unshift(sop); active = sop.id;
      toast("Generated"); renderEditor();
    } catch(e){
      const box=$("#errbox"); if (box){ box.style.display="block"; box.textContent = "Error: " + (e.message || 'Unknown') + ". Using local fallback."; }
      try{
        const sop = localFromNotes(raw, $("#gen-title-in")?.value);
        sop.id = makeId(); sops.unshift(sop); active = sop.id;
        toast("Generated (fallback)"); renderEditor();
      }catch{}
    } finally { setLoading(false); }
  });

  // ===== Unified Auto-Generate with AI (for BOTH buttons) =====
  const spinner = $("#enhance-status");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function fetchJSON(url, opts, retries=2){
    for (let a=0; a<=retries; a++){
      try{
        const res = await fetch(url, opts);
        if (res.ok){ let data=null; try{ data = await res.json(); }catch{} return { ok:true, data }; }
        if (a < retries && (res.status===502 || res.status===504 || res.status===429)){ await sleep(600*(a+1)); continue; }
        let msg=""; try{ msg = (await res.json())?.error || ""; }catch{}
        return { ok:false, error: msg || `HTTP ${res.status}` };
      }catch(err){
        if (a < retries){ await sleep(600*(a+1)); continue; }
        return { ok:false, error: err.message || 'Network error' };
      }
    }
  }

  function ensureActiveSop(){
    let sop = active ? sops.find(s => s.id === active) : null;
    if (!sop){
      sop = {
        id: makeId(),
        title:   ($("#sop-title")?.value || "").trim(),
        summary: ($("#sop-summary")?.value || "").trim(),
        steps: []
      };
      sops.unshift(sop); active = sop.id; renderEditor();
    }
    return sop;
  }

  async function generateFromTitleSummary(sop){
    const title   = ($("#sop-title")?.value || "").trim();
    const summary = ($("#sop-summary")?.value || "").trim();
    if (!title && !summary) return { openedModal: true }; // ask for notes

    const raw = (title ? `Title: ${title}\n` : '') + (summary || 'Generate a standard SOP outline.');
    if (spinner){
      spinner.style.display = 'flex';
      const label = spinner.querySelector('span:last-child'); if (label) label.textContent = 'Generating…';
    }
    setLoading(true, 'Generating…');

    try{
      const sopNew = await callGenerateAPI(raw, title || '');
      sop.title   = title || sopNew.title || sop.title || 'Untitled';
      sop.summary = sopNew.summary || summary || sop.summary || '';
      sop.steps   = Array.isArray(sopNew.steps) ? sopNew.steps : [];
      renderEditor(); renderPreview(sop); renderJSON(sop);
      toast('Generated');
      return { ok:true };
    }catch(err){
      console.error(err); toast('Generate failed: ' + (err.message || 'Unknown error'));
      return { ok:false };
    }finally{
      setLoading(false);
      if (spinner){
        spinner.style.display = 'none';
        const label = spinner.querySelector('span:last-child'); if (label) label.textContent = 'Enhancing…';
      }
    }
  }

  async function enhanceSteps(sop){
    if (spinner){
      spinner.style.display = 'flex';
      const label = spinner.querySelector('span:last-child'); if (label) label.textContent = 'Enhancing…';
    }
    setLoading(true, 'Enhancing steps…');

    try{
      const batch = await fetchJSON('/.netlify/functions/rewriteAll', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ steps: sop.steps, sopTitle: sop.title||'', sopSummary: sop.summary||'', detail: (window.__ULTRASOP_DETAIL || "full") })
      }, 1);

      let newSteps = null;
      if (batch.ok && Array.isArray(batch.data?.steps)){
        newSteps = batch.data.steps;
      } else {
        const out = [];
        for (let i=0; i<sop.steps.length; i++){
          const cur = sop.steps[i];
          const title = (typeof cur === 'string' ? cur : (cur?.title || '')).trim();
          if (!title){ out.push(cur); continue; }
          const r = await fetchJSON('/.netlify/functions/rewriteStep', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ step:title, sopTitle: sop.title||'', sopSummary: sop.summary||'', detail: (window.__ULTRASOP_DETAIL || "full") })
          }, 2);
          if (r.ok && r.data?.step){
            const s = r.data.step;
            out.push(typeof s === 'object' ? {
              title:       s.title || title,
              details:     s.details || '',
              ownerRole:   s.ownerRole || '',
              durationMin: (s.durationMin ?? null)
            } : (s || title));
          } else { out.push(cur); }
          await sleep(250);
        }
        newSteps = out;
      }

      if (!newSteps || !Array.isArray(newSteps)) throw new Error(batch.error || 'No steps returned');

      sop.steps = newSteps;
      renderEditor(); renderPreview(sop); renderJSON(sop);
      toast('Steps enhanced');
    }catch(err){
      console.error(err); toast('Enhance failed: ' + (err.message || 'Unknown error'));
    }finally{
      setLoading(false);
      if (spinner) spinner.style.display = 'none';
    }
  }

  async function autoGenerateOrEnhance(){
    const sop = ensureActiveSop();

    // No steps yet → generate from Title/Summary (or open modal)
    if (!Array.isArray(sop.steps) || sop.steps.length === 0){
      const res = await generateFromTitleSummary(sop);
      if (res && res.openedModal) { if (window.openGen) window.openGen(); }
      return;
    }
    // Steps exist → enhance
    await enhanceSteps(sop);
  }

  // Bind both possible buttons to the SAME flow:
  $("#btn-generate-inline")?.addEventListener("click", autoGenerateOrEnhance); // the button below Summary
  $("#btn-rewrite-all")?.addEventListener("click", autoGenerateOrEnhance);     // optional topbar button (safe to remove)

// ===== Versions (Save / Duplicate / Restore) =====
$("#btn-save")?.addEventListener("click", async () => {
  if (!active) { toast("Open a SOP first"); return; }
  const sop = sops.find(s=>s.id===active); if (!sop) { toast("No SOP found"); return; }

  // sync latest inputs to local sop
  sop.title   = $("#sop-title")?.value   ?? sop.title;
  sop.summary = $("#sop-summary")?.value ?? sop.summary;

  const notes = (window.prompt('Version notes (optional):','') || '').trim();

  try{
    setLoading(true, "Saving…");
    const n = await insertVersionRow(sop, notes);
    toast("Saved v"+n);

    // Keep a lightweight local snapshot so the UI can show something even offline
    sop.versions = Array.isArray(sop.versions) ? sop.versions : [];
    sop.versions.push({
      n,
      at: new Date().toISOString(),
      title: sop.title,
      summary: sop.summary,
      notes,
      steps: (sop.steps||[]).map(st => (typeof st==="string" ? st : (st.title||"")))
    });
    renderVersions();
    renderMySops();
  }catch(e){
    console.error(e);
    toast("Save failed: " + (e.message || 'Unknown'));
  }finally{
    setLoading(false);
  }
});

$("#btn-dup")?.addEventListener("click", async () => {
  if (!active){ toast('Open a SOP first'); return; }
  const src = sops.find(s=>s.id===active); if (!src){ toast('No SOP found'); return; }

  // Ensure ORIGINAL exists in DB so it appears under My SOPs
  try{ await upsertSopRow(src); }catch(e){ console.warn('dup upsert src', e); }
  renderMySops();

  // Create an in-memory copy (new working draft; unsaved until you Save Version)
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = makeId();
  copy._row_id = null; // new DB row will be created on next save
  copy.title = 'Copy of ' + (src.title || 'Untitled SOP');
  copy.versions = [];
  sops.unshift(copy); active = copy.id;
  renderEditor(); renderVersions(); toast('Duplicated');
});


// Restore uses whatever is loaded in memory for now
$("#versions-list")?.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-restore]'); if (!btn) return;
  const verN = parseInt(btn.getAttribute('data-restore'), 10);
  const sop = sops.find(s=>s.id===active); if (!sop){ toast('No SOP'); return; }
  const v = (sop.versions||[]).find(x=>x.n===verN); if (!v){ toast('Version not loaded locally'); return; }
  sop.title = v.title || 'Untitled'; sop.summary = v.summary || '';
  sop.steps = (v.steps || []).map(t => (typeof t==='string'? t : { title:t }));
  renderEditor(); document.querySelector('[data-tab="editor"]')?.click(); toast('Restored v'+verN);
});


  // ===== Templates library (sidebar “Quick templates”) =====
  const TEMPLATE_LIBRARY = {
    onboarding: { title:"New Employee Onboarding", summary:"Welcome, access, IT/security, buddy assignment, and first-week goals.", steps:[
      "Send welcome email with start date and checklist","Provision accounts (email, SSO, tools)","IT & security setup (2FA, password manager)","Assign buddy and schedule intro call","Share first-week goals and resources" ]},
    agency_client_onboarding: { title:"Client Onboarding (Agency)", summary:"Kickoff, asset collection, tracking, approvals, weekly cadence.", steps:[
      "Schedule kickoff and confirm stakeholders","Collect brand assets and credentials","Implement analytics & conversion tracking","Define deliverables and approval workflow","Set standing weekly cadence and reporting" ]},
    minor_outage: { title:"Minor Website Outage", summary:"Triage, communicate, rollback if needed, verify, and log.", steps:[
      "Acknowledge incident and create ticket","Triage scope and impact (pages, users, regions)","Roll back recent changes if correlated","Verify recovery and monitor metrics","Post-incident notes and follow-ups" ]},
    google_ads_weekly: { title:"Google Ads Weekly Routine", summary:"Search terms, negatives, budgets, tests, reporting, and logging.", steps:[
      "Review search terms and add negatives","Rebalance budgets by CPA/ROAS","Refresh ad copy and RSAs tests","Export performance report and email stakeholder","Log changes and next actions" ]},
    bug_triage: { title:"Bug Triage & Handoff", summary:"Repro, severity, labeling, assignment, ETA, and customer update.", steps:[
      "Reproduce issue with clear steps","Assign severity & labels","Attach logs / screenshots","Assign owner and ETA","Update customer and link ticket" ]},
    sales_discovery: { title:"Sales Discovery Call", summary:"Prep agenda, qualify needs, next steps, and CRM update.", steps:[
      "Prep agenda & research account","Run discovery and qualify","Identify stakeholders & timeline","Agree on next steps","Update CRM and share recap" ]}
  };

  (function renderQuickTemplates(){
    const list = $("#qtpl-list"); if (!list || typeof TEMPLATE_LIBRARY !== 'object') return;
    const picks = ['onboarding','agency_client_onboarding','minor_outage','google_ads_weekly'].filter(k => TEMPLATE_LIBRARY[k]);
    list.innerHTML = picks.map(k => `<button class="qtpl-btn" data-template="${k}">${TEMPLATE_LIBRARY[k].title}</button>`).join('');
  })();

async function renderMySops(){
  const box = document.getElementById('my-sops'); if (!box) return;
  box.innerHTML = '<div class="muted">Loading…</div>';

  if (!supabase){ box.innerHTML = '<div class="muted">Not configured</div>'; return; }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user){ box.innerHTML = '<div class="muted">Sign in to see your SOPs</div>'; return; }

  const { data, error } = await supabase
    .from('sops')
    .select('id, title, summary, updated_at')
    .eq('user_id', user.id)               // only this user’s rows
    .order('updated_at', { ascending:false })
    .limit(30);

  if (error){ console.warn(error); box.innerHTML = '<div class="muted">Could not load</div>'; return; }
  if (!data || data.length === 0){ box.innerHTML = '<div class="muted">No SOPs yet</div>'; return; }

  box.innerHTML = data.map(r => `
    <div class="qtpl-btn" style="display:flex;justify-content:space-between;align-items:center">
      <button class="qtpl-btn" data-open-sop="${r.id}" style="border:0;background:none;padding:0">
        ${r.title || 'Untitled SOP'}
      </button>
      <button class="btn" data-del-sop="${r.id}" style="padding:4px 8px">Delete</button>
    </div>
  `).join('');
}

async function openSopByRowId(rowId){
  const { data, error } = await supabase
    .from('sops')
    .select('id, title, summary, steps')
    .eq('id', rowId)
    .single();
  if (error){ toast('Load failed'); return; }
  try{ localStorage.setItem(lastOpenKey(), String(data.id)); }catch(e){}
  const sop = {
    id: makeId(),
    _row_id: data.id,
    title: data.title || '',
    summary: data.summary || '',
    steps: Array.isArray(data.steps) ? data.steps : []
  };
  sops.unshift(sop); active = sop.id;
  document.querySelector('[data-tab="editor"]')?.click();
  renderEditor(); renderVersions();
}

// Handle clicks in the "My SOPs" list (open + delete)
document.getElementById('my-sops')?.addEventListener('click', async (e) => {
  const openBtn = e.target.closest('[data-open-sop]');
  if (openBtn){
    e.preventDefault();
    await openSopByRowId(openBtn.getAttribute('data-open-sop'));
    return;
  }

  const delBtn = e.target.closest('[data-del-sop]');
  if (delBtn){
    const id = delBtn.getAttribute('data-del-sop');
    if (!confirm('Delete this SOP (and its versions)?')) return;
    const { error } = await supabase.from('sops').delete().eq('id', id);
    if (error){ toast('Delete failed'); return; }
    toast('Deleted');
    renderMySops();
  }
});

$(".aside")?.addEventListener("click", async (e) => {
  // Open an existing SOP from the list
  const openBtn = e.target.closest("[data-open-sop]");
  if (openBtn){
    openSopByRowId(openBtn.getAttribute("data-open-sop"));
    return;
  }

  // Delete a SOP
  const delBtn = e.target.closest("[data-del-sop]");
  if (delBtn){
    const id = delBtn.getAttribute("data-del-sop");
    if (!confirm("Delete this SOP (and its versions)?")) return;
    const { error } = await supabase.from('sops').delete().eq('id', id);
    if (error) { toast('Delete failed'); return; }
    toast('Deleted'); renderMySops();
    return;
  }

  // Add a template into the editor
  const tplBtn = e.target.closest(".qtpl-btn[data-template]");
  if (tplBtn){
    const key = tplBtn.getAttribute("data-template");
    const t = TEMPLATE_LIBRARY[key];
    if (!t) { toast("Template not found"); return; }
    const sop = { id: makeId(), title:t.title, summary:t.summary, steps: t.steps.slice() };
    sops.unshift(sop); active = sop.id;
    document.querySelector('[data-tab="editor"]')?.click();
    renderEditor(); toast("Template added");
  }
});


  // ===== Start empty =====
  sops = []; active = null;

// First paint: try showing user's list; if nothing open, load a draft
renderMySops();
if (!active) tryLoadDraft();

  // ===== How steps: line measurement =====
  (function(){
    try{
      const wrap = $("#how-steps"); if (!wrap) return;
      const steps = Array.prototype.slice.call(wrap.querySelectorAll('.hstep'));
      function setActive(n){
        steps.forEach((btn,i) => {
          const on = i===n; btn.classList.toggle('active', on);
          btn.setAttribute('aria-current', on ? 'step' : 'false');
        });
      }
      let current = steps.findIndex(b => b.classList.contains('active'));
      if (current < 0) current = 0; setActive(current);

      function measureRail(){
        const firstDot = steps[0]?.querySelector('.dot');
        const lastDot  = steps[steps.length-1]?.querySelector('.dot');
        if (!firstDot || !lastDot) return;
        const host = wrap; const hostRect = host.getBoundingClientRect();
        const f = firstDot.getBoundingClientRect(); const l = lastDot.getBoundingClientRect();
        const top = Math.round((f.top + f.height/2) - hostRect.top);
        const bottom = Math.round(hostRect.bottom - (l.top + l.height/2));
        host.style.setProperty('--lineTop', top + 'px');
        host.style.setProperty('--lineBottom', bottom + 'px');
      }
      window.addEventListener('load', measureRail);
      window.addEventListener('resize', measureRail);
      setTimeout(measureRail, 0);
    }catch(e){ console.error('how-steps init error:', e); }
  })();

  // ===== How steps: swap GIF on click =====
  (function(){
    try{
      const wrap = $("#how-steps"); if (!wrap) return;
      const buttons = wrap.querySelectorAll('.hstep');
      const shot = document.querySelector('.hshot');
      const img  = shot ? shot.querySelector('img') : null;
      const ph   = shot ? shot.querySelector('.ph')  : null;
      const showPlaceholder = () => { if (!img) return; img.style.display='none'; if (ph) ph.style.display='grid'; };
      function showSrc(src){
        if (!img) return; if (!src){ showPlaceholder(); return; }
        img.onload  = () => { img.style.display='block'; if (ph) ph.style.display='none'; };
        img.onerror = showPlaceholder;
        img.src = src + (src.indexOf('?')>-1 ? '&' : '?') + 'v=' + Date.now();
      }
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b)=>{ b.classList.remove('active'); b.removeAttribute('aria-current'); });
          btn.classList.add('active'); btn.setAttribute('aria-current','step');
          showSrc(btn.getAttribute('data-gif') || '');
        });
      });
      const activeBtn = wrap.querySelector('.hstep.active'); if (activeBtn) showSrc(activeBtn.getAttribute('data-gif') || '');
    }catch(e){ console.error('how-steps gif error:', e); }
  })();

  // ===== Pricing period toggle =====
  (function(){
    try{
      const tgl  = $("#billToggle");
      const grid = $("#pricingGrid");
      if (!tgl || !grid) return;
      function setPeriod(isAnnual){
        grid.querySelectorAll('.pcard').forEach((card) => {
          const m = parseFloat(card.getAttribute('data-month')||'0');
          const y = parseFloat(card.getAttribute('data-year') || m);
          const amtEl = card.querySelector('.amt');
          const perEl = card.querySelector('.per');
          const val = isAnnual ? y : m;
          if (amtEl) amtEl.textContent = '$' + (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1));
          if (perEl) perEl.textContent = isAnnual ? '/mo (billed yearly)' : '/mo';
        });
      }
      setPeriod(false);
      tgl.addEventListener('change', () => setPeriod(tgl.checked));
    }catch(e){ console.error('pricing toggle error:', e); }
  })();

  // ===== FAQ accordion =====
  (function(){
    try{
      const faq = document.querySelector('.faq'); if (!faq) return;
      const btns = faq.querySelectorAll('.acc-btn');
      function closeOthers(current){
        btns.forEach((btn) => {
          if (btn !== current){
            btn.setAttribute('aria-expanded','false');
            btn.parentElement.classList.remove('open');
            const p = btn.nextElementSibling; if (p) p.style.maxHeight = 0;
          }
        });
      }
      btns.forEach((btn) => {
        const panel = btn.nextElementSibling;
        if (btn.getAttribute('aria-expanded') === 'true'){
          btn.parentElement.classList.add('open');
          if (panel) panel.style.maxHeight = panel.scrollHeight + 'px';
        }
        btn.addEventListener('click', () => {
          const expanded = btn.getAttribute('aria-expanded') === 'true';
          if (expanded){
            btn.setAttribute('aria-expanded','false');
            btn.parentElement.classList.remove('open');
            if (panel) panel.style.maxHeight = 0;
          } else {
            closeOthers(btn);
            btn.setAttribute('aria-expanded','true');
            btn.parentElement.classList.add('open');
            if (panel) panel.style.maxHeight = panel.scrollHeight + 'px';
          }
        });
      });
      window.addEventListener('resize', () => {
        faq.querySelectorAll('.acc-btn[aria-expanded="true"]').forEach((btn) => {
          const p = btn.nextElementSibling; if (p) p.style.maxHeight = p.scrollHeight + 'px';
        });
      });
    }catch(e){ console.error('faq init error:', e); }
  })();

