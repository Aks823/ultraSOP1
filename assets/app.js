// /assets/app.js
import { createClient } from '@supabase/supabase-js';

// --- Supabase client (use the values you saved in 1.3) ---
const SUPABASE_URL = 'https://ngtbivfiqekbyypedkuz.supabase.co';      // <-- replace
const SUPABASE_ANON_KEY = 'sb_publishable_wM0xuQ5O3OUtDOMo1sPcZg_brujOuzQ';   // <-- replace

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(() => {
  'use strict';

  // --- Supabase client (v2) ---
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL  = (window.ENV && window.ENV.SUPABASE_URL) || '';
const SB_ANON = (window.ENV && window.ENV.SUPABASE_ANON_KEY) || '';
export const supabase = (SB_URL && SB_ANON)
  ? createClient(SB_URL, SB_ANON, { auth: { persistSession: true, storage: window.localStorage }})
  : null;

    // Supabase smoke test — should log "OK"; session will be null if not signed in.
  supabase.auth.getSession()
    .then(({ data, error }) => {
      if (error) {
        console.error('[Supabase] error:', error);
      } else {
        console.log('[Supabase] OK, session:', data.session);
      }
    });

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

  // ===== Supabase client (reads values we set on window in index.html) =====
const supa = (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY)
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

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
    btn.onclick = async () => {
      try { await supa.auth.signOut(); } catch(e) {}
    };
  } else {
    // Signed out
    btn.textContent = 'Sign in';
    btn.onclick = () => openAuth();
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
  // reset app state
  sops = [];
  active = null;

  // clear UI fields
  const t = document.getElementById('sop-title');    if (t) t.value = '';
  const s = document.getElementById('sop-summary');  if (s) s.value = '';
  const ul= document.getElementById('steps-list');   if (ul) ul.innerHTML = '';
  const pv= document.getElementById('preview');      if (pv) pv.innerHTML = '';
  const jb= document.getElementById('jsonbox');      if (jb) jb.textContent = '';
  const vl= document.getElementById('versions-list');if (vl) vl.innerHTML = '';

  toast('Cleared');
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


  // ===== PDF =====
  $("#btn-download-pdf")?.addEventListener("click", () => {
    try{
      const sop = sops.find(s => s.id === active);
      if (!sop) { toast("No SOP open"); return; }
      const JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      if (!JsPDF) { toast("PDF engine missing"); return; }
      const doc = new JsPDF({ unit:"pt", format:"a4" });

      const margin = 56; let y = margin;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const wrap = (t,w) => doc.splitTextToSize(String(t||''), w);
      const line = (txt,opts={}) => {
        wrap(txt, pageW-margin*2).forEach((l) => {
          if (y > pageH - margin) { doc.addPage(); y = margin; }
          doc.text(l, margin, y, opts); y += 16;
        });
      };

      // Header
      doc.setFillColor(255,122,26); doc.rect(0,0,pageW,36,'F');
      doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(14);
      doc.text('UltraSOP', margin, 24);

      // Title + Summary
      y = 72;
      doc.setTextColor(17,24,39); doc.setFontSize(20); doc.setFont('helvetica','bold');
      line(sop.title || 'Untitled SOP');
      if (sop.summary){
        y += 6; doc.setFont('helvetica','normal'); doc.setFontSize(12); doc.setTextColor(55,65,81);
        line(sop.summary); y += 6;
      }

      // Steps
      doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(17,24,39);
      line('Steps'); doc.setFont('helvetica','normal'); doc.setFontSize(12);
      (Array.isArray(sop.steps) ? sop.steps : []).forEach((st,i) => {
        const sObj = (st && typeof st === 'object') ? st : { title: st };
        const title = String(sObj.title || '');
        y += 4; doc.setFont('helvetica','bold'); line(`Step ${i+1}: ${title}`); doc.setFont('helvetica','normal');
        const details = typeof sObj.details === 'string' ? sObj.details : '';
        if (details) line(details);

        const checklist = Array.isArray(sObj.checklist) ? sObj.checklist.map(String) : [];
        if (checklist.length){ line('Checklist:'); checklist.forEach(it => line(`• ${it}`)); }
        const prereq = Array.isArray(sObj.prerequisites) ? sObj.prerequisites.map(String) : [];
        if (prereq.length){ line('Prerequisites:'); prereq.forEach(it => line(`• ${it}`)); }

        const duration = (typeof sObj.durationMin === 'number') ? sObj.durationMin : null;
        const owner = (typeof sObj.ownerRole === 'string' && sObj.ownerRole.trim()) ? sObj.ownerRole : null;
        const meta = [owner ? `Owner: ${owner}` : '', duration != null ? `Duration: ${duration} min` : ''].filter(Boolean).join('  ');
        if (meta) line(meta);

        const risk = (typeof sObj.riskNotes === 'string' && sObj.riskNotes.trim()) ? sObj.riskNotes : null;
        if (risk) line(`Risks: ${risk}`);
        y += 4;
      });

      // Footer
      const pages = doc.getNumberOfPages();
      for (let p=1; p<=pages; p++){
        doc.setPage(p); const h = doc.internal.pageSize.getHeight();
        doc.setFontSize(10); doc.setTextColor(107,114,128);
        doc.text(`Generated by UltraSOP — ${new Date().toLocaleString()}`, margin, h-24);
        doc.text(`${p} / ${pages}`, pageW - margin, h-24, { align:'right' });
      }

      const fileName = (sop.title || 'UltraSOP').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()+'.pdf';
      doc.save(fileName); toast("PDF downloaded");
    } catch(e){ console.error(e); toast('PDF export failed: '+(e.message||'Unknown')); }
  });

  // ===== Functions endpoints =====
  async function callGenerateAPI(raw, overrideTitle){
    const res = await fetch('/.netlify/functions/generateSop', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ inputText: raw, overrideTitle: overrideTitle || "" })
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
        body: JSON.stringify({ steps: sop.steps, sopTitle: sop.title||'', sopSummary: sop.summary||'' })
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
            body: JSON.stringify({ step:title, sopTitle: sop.title||'', sopSummary: sop.summary||'' })
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

  $(".aside")?.addEventListener("click", (e) => {
    const b = e.target.closest(".qtpl-btn"); if (!b) return;
    const key = b.getAttribute("data-template"); const t = TEMPLATE_LIBRARY[key]; if (!t) return;
    const sop = { id: makeId(), title:t.title, summary:t.summary, steps: t.steps.slice() };
    sops.unshift(sop); active = sop.id; document.querySelector('[data-tab="editor"]')?.click();
    renderEditor(); toast("Template added");
  });

  $("#templates")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-template]"); if (!btn) return;
    const key = btn.getAttribute("data-template"); const t = TEMPLATE_LIBRARY[key];
    if (!t) { toast("Template not found"); return; }
    const sop = { id: makeId(), title:t.title, summary:t.summary, steps: t.steps.slice() };
    sops.unshift(sop); active = sop.id; document.querySelector('[data-tab="editor"]')?.click();
    renderEditor(); toast("Template added");
  });

  // ===== Start empty =====
  sops = []; active = null;

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

})();
