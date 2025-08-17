// /assets/app.js
(() => {
  'use strict';

  // ===== Helpers =====
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const toast = m => { const el=$("#toast"); if(!el) return; el.textContent=m; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"), 1600); };
  const makeId = () => 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const setLoading = (on, txt) => { $("#overlay")?.classList.toggle("show", on); const t=$("#overlay-text"); if(t) t.textContent = txt || "Generating…"; const btn=$("#gen-run"); if(btn) btn.disabled = !!on; };

  // Year in footer (guarded)
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Top nav smooth scrolls
  $("#nav-get")?.addEventListener("click", () => document.getElementById("app")?.scrollIntoView({ behavior: "smooth" }));
  $("#hero-try")?.addEventListener("click", () => $("#btn-open-modal")?.click());
  $("#hero-learn")?.addEventListener("click", () => document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" }));

  // ===== Tabs =====
  $$(".tabbtn").forEach(b=>{
    b.onclick = ()=>{
      $$(".tabbtn").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      $$(".tab").forEach(t=>t.classList.remove("visible"));
      $("#tab-"+b.dataset.tab)?.classList.add("visible");
      if (b.dataset.tab === "versions") renderVersions();
    };
  });

  // ===== Generate modal =====
  const modal=$("#gen-modal");
  const openGen  = ()=>{ if(!modal) return; modal.classList.add("show"); modal.setAttribute("aria-hidden","false"); $("#errbox")?.style && ($("#errbox").style.display="none"); $("#gen-input")?.focus(); };
  const closeGen = ()=>{ if(!modal) return; modal.classList.remove("show"); modal.setAttribute("aria-hidden","true"); };
  $("#btn-open-modal")?.addEventListener('click', openGen);
  $("#gen-close")?.addEventListener('click', closeGen);
  $("#gen-cancel")?.addEventListener('click', closeGen);

  $$(".segbtn").forEach(b=>b.addEventListener('click', ()=>{
    $$(".segbtn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    const which=b.dataset.panel;
    if ($("#panel-text"))  $("#panel-text").style.display  = which==="text" ? "block" : "none";
    if ($("#panel-audio")) $("#panel-audio").style.display = which==="audio"? "block" : "none";
  }));

  $("#btn-sample")?.addEventListener('click', ()=>{
    const el = $("#gen-input"); if(!el) return;
    el.value = "Title: Google Ads weekly routine\n1) Review search terms and add negatives\n2) Rebalance budgets based on CPA\n3) Refresh ad copy tests\n4) Export report and email client\n5) Log changes in Notion";
  });

  // ===== State =====
  let sops = [];
  let active = null;

  // ===== Rendering =====
  function renderEditor(){
    if(!active) return;
    const sop = sops.find(s=>s.id===active); if(!sop) return;

    $("#sop-title").value   = sop.title   || "";
    $("#sop-summary").value = sop.summary || "";

    const ul = $("#steps-list"); if(!ul) return;
    ul.innerHTML = "";

    (sop.steps||[]).forEach((st,i)=>{
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
          '<div class="ownergroup'+(hasOwner ? ' show' : '')+'" data-idx="'+i+'">' +
            '<input class="input step-owner" placeholder="Owner role (optional)" value="'+(hasOwner ? st.ownerRole.replace(/"/g,'&quot;') : '')+'" style="max-width:240px" />' +
          '</div>' +
          '<div class="durgroup'+(hasDur ? ' show' : '')+'" data-idx="'+i+'">' +
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

      // prefill
      if (isObj) {
        const ta = li.querySelector('.step-details'); if (st.details && ta){ ta.style.display = "block"; ta.value = st.details; }
        const ownerEl = li.querySelector('.step-owner'); if(ownerEl && st.ownerRole) ownerEl.value = st.ownerRole;
        const durEl   = li.querySelector('.step-duration'); if(durEl && (st.durationMin || st.durationMin === 0)) durEl.value = st.durationMin;
      }
      ul.appendChild(li);
    });

    // Title edits
    ul.querySelectorAll(".step-title").forEach((inp, idx)=>{
      inp.oninput = (e)=>{
        const txt = e.target.value;
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = txt;
        else sop.steps[idx].title = txt;
        renderPreview(sop); renderJSON(sop);
      };
    });

    // Toggle details
    ul.querySelectorAll("[data-more]").forEach(btn=>{
      btn.onclick = ()=>{
        const idx = parseInt(btn.getAttribute("data-more"), 10);
        const ta = ul.querySelector('.step-details[data-idx="'+idx+'"]');
        if (!ta) return;
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details: "" };
        ta.style.display = (ta.style.display === "none" || !ta.style.display) ? "block" : "none";
      };
    });

    // Details input
    ul.querySelectorAll(".step-details").forEach(ta=>{
      ta.oninput = (e)=>{
        const idx = parseInt(ta.getAttribute("data-idx"), 10);
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details: "" };
        sop.steps[idx].details = e.target.value;
        renderPreview(sop); renderJSON(sop);
      };
    });

    // Remove
    ul.querySelectorAll("[data-rm]").forEach(btn=>{
      btn.onclick = ()=>{
        const idx = parseInt(btn.dataset.rm, 10);
        sop.steps.splice(idx, 1);
        renderEditor(); renderPreview(sop); renderJSON(sop);
      };
    });

    // Move up/down
    ul.querySelectorAll("[data-up]").forEach(btn=>{
      btn.onclick = ()=>{
        const idx = parseInt(btn.dataset.up, 10);
        if (idx <= 0) return;
        [sop.steps[idx-1], sop.steps[idx]] = [sop.steps[idx], sop.steps[idx-1]];
        renderEditor(); renderPreview(sop); renderJSON(sop);
      };
    });
    ul.querySelectorAll("[data-down]").forEach(btn=>{
      btn.onclick = ()=>{
        const idx = parseInt(btn.dataset.down, 10);
        if (idx >= sop.steps.length - 1) return;
        [sop.steps[idx], sop.steps[idx+1]] = [sop.steps[idx+1], sop.steps[idx]];
        renderEditor(); renderPreview(sop); renderJSON(sop);
      };
    });

    // Owner toggle + input
    ul.querySelectorAll("[data-owner]").forEach(btn=>{
      btn.onclick = ()=>{
        const idx = parseInt(btn.getAttribute("data-owner"),10);
        const group = ul.querySelector('.ownergroup[data-idx="'+idx+'"]');
        if(!group) return;
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
    ul.querySelectorAll(".step-owner").forEach(inp=>{
      inp.oninput = (e)=>{
        const idx = parseInt(inp.closest(".ownergroup").getAttribute("data-idx"),10);
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details:"", ownerRole:"" };
        sop.steps[idx].ownerRole = e.target.value;
        renderPreview(sop); renderJSON(sop);
      };
    });

    // Duration toggle + input
    ul.querySelectorAll("[data-duration]").forEach(btn=>{
      btn.onclick = ()=>{
        const idx = parseInt(btn.getAttribute("data-duration"),10);
        const group = ul.querySelector('.durgroup[data-idx="'+idx+'"]');
        if(!group) return;
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
    ul.querySelectorAll(".step-duration").forEach(inp=>{
      inp.oninput = (e)=>{
        const idx = parseInt(inp.closest(".durgroup").getAttribute("data-idx"),10);
        const val = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value,10) || 0);
        if (typeof sop.steps[idx] === "string") sop.steps[idx] = { title: sop.steps[idx], details:"", durationMin:null };
        sop.steps[idx].durationMin = val;
        renderPreview(sop); renderJSON(sop);
      };
    });

    // Add Step (fixed: define sop inside handler)
    const addBtn = document.getElementById('btn-add-step');
    if (addBtn){
      addBtn.onclick = ()=>{
        const sop = sops.find(s=>s.id===active);
        if(!sop) return;
        sop.steps = sop.steps || [];
        sop.steps.push({ title: 'New step' });
        renderEditor(); renderPreview(sop); renderJSON(sop);
        document.querySelector('#steps-list .steprow:last-child')?.scrollIntoView({ behavior:'smooth', block:'center' });
      };
    }

    // Title/summary inputs
    $("#sop-title").oninput   = e=>{ sop.title   = e.target.value; renderPreview(sop); renderJSON(sop); };
    $("#sop-summary").oninput = e=>{ sop.summary = e.target.value; renderPreview(sop); renderJSON(sop); };

    renderPreview(sop); renderJSON(sop);
  }

  function renderPreview(sop){
    const steps=(sop.steps||[]).map((st,i)=>{
      const t = typeof st==="string"? st : (st.title||"");
      const owner = (typeof st === "object" && st.ownerRole) ? st.ownerRole : "";
      const dur   = (typeof st === "object" && (st.durationMin || st.durationMin === 0)) ? st.durationMin : "";
      const details = (typeof st === "object" && st.details) ? st.details : "";
      const meta = [owner ? `Owner: ${owner}` : '', (dur!=='' ? `Duration: ${dur} min` : '')].filter(Boolean).join(' · ');
      return '<div style="border:1px dashed #ffd9b7;background:#fff;border-radius:12px;padding:10px;margin-bottom:8px">'
        + '<strong>Step '+(i+1)+':</strong> '+t
        + (meta ? '<div class="muted" style="font-size:12px;margin-top:4px">'+meta+'</div>' : '')
        + (details ? '<div style="margin-top:6px">'+String(details).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>' : '')
        + '</div>';
    }).join("");
    $("#preview").innerHTML = '<h4 style="margin:0 0 6px">'+(sop.title||"Untitled SOP")+'</h4>'
      + '<p class="muted" style="margin:0 0 10px">'+(sop.summary||"")+'</p>'+steps;
  }

  function renderJSON(sop){ const jb = $("#jsonbox"); if(jb) jb.textContent = JSON.stringify(sop, null, 2); }

  function renderVersions(){
    if(!active) return;
    const sop  = sops.find(s=>s.id===active);
    const list = $("#versions-list"); if(!list) return;
    list.innerHTML = "";

    const versions = Array.isArray(sop?.versions) ? sop.versions : [];
    if(versions.length === 0){
      list.innerHTML = '<div class="card"><strong>No versions yet.</strong><p class="muted">Click "Save Version" in the top bar to snapshot this SOP.</p></div>';
      return;
    }

    versions.slice().reverse().forEach(v=>{
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
document.getElementById('btn-download-pdf')?.addEventListener('click', () => {
  try {
    const sop = sops.find(s => s.id === active);
    if (!sop) { toast('No SOP open'); return; }

    // support both UMD and global (in case you add the CDN tag)
    const JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDF) { toast('PDF engine missing'); return; }

    const doc = new JsPDF({ unit: 'pt', format: 'a4' });

    const margin = 56;
    let y = margin;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const wrap = (text, width) => doc.splitTextToSize(String(text || ''), width);
    const line = (txt, opts = {}) => {
      const lines = wrap(txt, pageW - margin * 2);
      for (const l of lines) {
        if (y > pageH - margin) { doc.addPage(); y = margin; }
        doc.text(l, margin, y, opts);
        y += 16;
      }
    };

    // Header
    doc.setFillColor(255, 122, 26); doc.rect(0, 0, pageW, 36, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('UltraSOP', margin, 24);

    // Title + Summary
    y = 72;
    doc.setTextColor(17, 24, 39); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    line(sop.title || 'Untitled SOP');

    if (sop.summary) {
      y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(55, 65, 81);
      line(sop.summary);
      y += 6;
    }

    // Steps
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(17, 24, 39);
    line('Steps');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12);

    const steps = Array.isArray(sop.steps) ? sop.steps : [];
    steps.forEach((st, i) => {
      const sObj = (st && typeof st === 'object') ? st : { title: st };
      const title = String(sObj.title || '');

      y += 4;
      doc.setFont('helvetica', 'bold'); line(`Step ${i + 1}: ${title}`);
      doc.setFont('helvetica', 'normal');

      const details = typeof sObj.details === 'string' ? sObj.details : '';
      if (details) line(details);

      const checklist = Array.isArray(sObj.checklist) ? sObj.checklist.map(String) : [];
      if (checklist.length) {
        line('Checklist:');
        checklist.forEach(item => line(`• ${item}`));
      }

      const prereq = Array.isArray(sObj.prerequisites) ? sObj.prerequisites.map(String) : [];
      if (prereq.length) {
        line('Prerequisites:');
        prereq.forEach(item => line(`• ${item}`));
      }

      const duration = (typeof sObj.durationMin === 'number') ? sObj.durationMin : null;
      const owner = (typeof sObj.ownerRole === 'string' && sObj.ownerRole.trim()) ? sObj.ownerRole : null;
      const risk = (typeof sObj.riskNotes === 'string' && sObj.riskNotes.trim()) ? sObj.riskNotes : null;

      const meta = [owner ? `Owner: ${owner}` : '', duration != null ? `Duration: ${duration} min` : '']
        .filter(Boolean).join('  ');
      if (meta) line(meta);
      if (risk) line(`Risks: ${risk}`);

      y += 4;
    });

    // Footer
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(10); doc.setTextColor(107, 114, 128);
      doc.text(`Generated by UltraSOP — ${new Date().toLocaleString()}`, margin, h - 24);
      doc.text(`${p} / ${pages}`, pageW - margin, h - 24, { align: 'right' });
    }

    const fileName = (sop.title || 'UltraSOP').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() + '.pdf';
    doc.save(fileName);
    toast('PDF downloaded');
  } catch (e) {
    console.error(e);
    toast('PDF export failed: ' + (e.message || 'Unknown'));
  }
});


  // ===== Generate via function =====
  async function callGenerateAPI(raw, overrideTitle){
    const res = await fetch('/.netlify/functions/generateSop', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ inputText: raw, overrideTitle: overrideTitle||"" })
    });
    const data = await res.json().catch(()=>({error:"Invalid server response"}));
    if(!res.ok){ throw new Error(data?.error || ("HTTP "+res.status)); }
    return data.sop;
  }

$("#gen-run")?.addEventListener('click', async ()=>{
  const raw = $("#gen-input")?.value.trim();
  if(!raw){
    const e=$("#errbox"); if(e){ e.style.display="block"; e.textContent="Paste some text first."; }
    return;
  }
  const err=$("#errbox"); if(err) err.style.display="none";
  const t0 = performance.now(); setLoading(true,"Generating…");

  // Tiny local fallback in case the function errors
  const localFromNotes = (notes, overrideTitle) => {
    const lines = String(notes).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const bulletRx = /^(\d+[\.\)]\s+|[-*]\s+)/;
    let title = (overrideTitle || '').trim();
    if (!title) {
      const tLine = lines.find(l => /^title\s*:/i.test(l));
      title = tLine ? tLine.replace(/^title\s*:/i,'').trim() : (lines[0] || 'Untitled SOP');
    }
    const steps = lines.filter(l => bulletRx.test(l)).map(l => l.replace(bulletRx,'').trim());
    const summary = lines.filter(l => !bulletRx.test(l) && !/^title\s*:/i.test(l)).slice(0,3).join(' — ').slice(0,240);
    return {
      title,
      summary,
      steps: (steps.length ? steps : ['Plan the work','Perform the work','Review & finalize']).map(s => ({ title: s }))
    };
  };

  try{
    const sop = await callGenerateAPI(raw, $("#gen-title-in")?.value);
    const t1 = performance.now(); const m=$("#metrics"); if(m) m.textContent = "Generated in " + ((t1-t0)/1000).toFixed(1) + "s";
    sop.id = makeId();
    sops.unshift(sop); active=sop.id;
    closeGen(); toast("Generated");
    renderEditor();
  }catch(e){
    const box=$("#errbox"); if(box){ box.style.display="block"; box.textContent = "Error: " + (e.message || 'Unknown') + ". Using local fallback."; }
    // Local fallback so user isn’t blocked
    try{
      const sop = localFromNotes(raw, $("#gen-title-in")?.value);
      sop.id = makeId();
      sops.unshift(sop); active=sop.id;
      closeGen(); toast("Generated (fallback)");
      renderEditor();
    }catch{}
  }finally{
    setLoading(false);
  }
});

  // ===== Versions =====
  document.getElementById('btn-save')?.addEventListener('click', ()=>{
    if(!active){ toast("Open a SOP first"); return; }
    const sop = sops.find(s=>s.id===active);
    if(!sop){ toast("No SOP found"); return; }

    sop.versions = Array.isArray(sop.versions) ? sop.versions : [];
    const nextN = sop.versions.length ? sop.versions[sop.versions.length-1].n + 1 : 1;
    const notes = window.prompt('Version notes (optional):', '') || '';

    sop.versions.push({
      n: nextN, at: new Date().toISOString(),
      title: sop.title || "Untitled", summary: sop.summary || "",
      notes: notes.trim(),
      steps: (sop.steps||[]).map(st => (typeof st==="string" ? st : (st.title||"")))
    });

    toast("Saved v"+nextN);
    renderVersions();
  });

  document.getElementById('btn-dup')?.addEventListener('click', ()=>{
    if(!active){ toast('Open a SOP first'); return; }
    const src = sops.find(s=>s.id===active);
    if(!src){ toast('No SOP found'); return; }
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = makeId();
    copy.title = 'Copy of ' + (src.title || 'Untitled SOP');
    copy.versions = [];
    sops.unshift(copy);
    active = copy.id;
    renderEditor(); renderVersions(); toast('Duplicated');
  });

  // ===== Auto Generate with AI / Enhance (hybrid) =====
(function(){
  const btn = document.getElementById('btn-rewrite-all');
  if (!btn) return;

  const spinner = document.getElementById('enhance-status');
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));

  async function fetchJSON(url, opts, retries=2){
    for (let a=0; a<=retries; a++){
      try{
        const res = await fetch(url, opts);
        if (res.ok){
          let data=null; try{ data = await res.json(); }catch{}
          return { ok:true, data };
        }
        if (a < retries && (res.status===502 || res.status===504 || res.status===429)){
          await sleep(600*(a+1)); continue;
        }
        let msg=""; try{ msg = (await res.json())?.error || ""; }catch{}
        return { ok:false, error: msg || `HTTP ${res.status}` };
      }catch(err){
        if (a < retries){ await sleep(600*(a+1)); continue; }
        return { ok:false, error: err.message || 'Network error' };
      }
    }
  }

  // Generate steps if none exist, using Title/Summary fields (no modal)
  async function generateFromTitleSummary(sop){
    const title   = (document.getElementById('sop-title')?.value || '').trim();
    const summary = (document.getElementById('sop-summary')?.value || '').trim();

    // If the user hasn't entered anything, fall back to the modal
    if (!title && !summary) return { openedModal: true };

    // Build a simple raw input for your /generateSop function
    const raw = (title ? `Title: ${title}\n` : '') + (summary || 'Generate a standard SOP outline.');

    // Update spinner label to “Generating…”
    if (spinner) {
      spinner.style.display = 'flex';
      const label = spinner.querySelector('span:last-child');
      if (label) label.textContent = 'Generating…';
    }
    setLoading(true, 'Generating…');

    try{
      const sopNew = await callGenerateAPI(raw, title || '');
      // Update the current SOP in place
      sop.title   = title || sopNew.title || sop.title || 'Untitled';
      sop.summary = sopNew.summary || summary || sop.summary || '';
      sop.steps   = Array.isArray(sopNew.steps) ? sopNew.steps : [];

      renderEditor(); renderPreview(sop); renderJSON(sop);
      toast('Generated');
      return { ok:true };
    }catch(err){
      console.error(err);
      toast('Generate failed: ' + (err.message || 'Unknown error'));
      return { ok:false };
    }finally{
      setLoading(false);
      if (spinner) {
        spinner.style.display = 'none';
        const label = spinner.querySelector('span:last-child');
        if (label) label.textContent = 'Enhancing…'; // restore default text
      }
    }
  }

  btn.addEventListener('click', async ()=>{
    if (!active){ toast('Open a SOP first'); return; }
    const sop = sops.find(s=>s.id===active);
    if (!sop){ toast('No SOP found'); return; }

    // If NO steps yet: generate using Title/Summary, or open the modal if fields are empty
    if (!Array.isArray(sop.steps) || sop.steps.length === 0){
      const res = await generateFromTitleSummary(sop);
      if (res?.openedModal){
        // Nothing in Title/Summary — open the modal to collect rough notes
        if (typeof openGen === 'function') openGen();
        else document.getElementById('btn-open-modal')?.click();
      }
      return;
    }

    // If steps exist: run the existing enhance flow
    if (spinner) {
      spinner.style.display = 'flex';
      const label = spinner.querySelector('span:last-child');
      if (label) label.textContent = 'Enhancing…';
    }
    setLoading(true, 'Enhancing steps…');

    try{
      // Try batch endpoint
      const batch = await fetchJSON('/.netlify/functions/rewriteAll', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ steps: sop.steps, sopTitle: sop.title||'', sopSummary: sop.summary||'' })
      }, 1);

      let newSteps = null;

      if (batch.ok && Array.isArray(batch.data?.steps)) {
        newSteps = batch.data.steps;
      } else {
        // Fallback: per-step rewrite
        const out = [];
        for (let i=0; i<sop.steps.length; i++){
          const cur   = sop.steps[i];
          const title = (typeof cur==='string' ? cur : (cur?.title||'')).trim();
          if (!title){ out.push(cur); continue; }

          const r = await fetchJSON('/.netlify/functions/rewriteStep', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ step:title, sopTitle: sop.title||'', sopSummary: sop.summary||'' })
          }, 2);

          if (r.ok && r.data?.step){
            const s = r.data.step;
            out.push(typeof s==='object' ? {
              title:       s.title || title,
              details:     s.details || '',
              ownerRole:   s.ownerRole || '',
              durationMin: (s.durationMin ?? null)
            } : (s || title));
          } else {
            out.push(cur);
          }
          await sleep(250);
        }
        newSteps = out;
      }

      if (!newSteps || !Array.isArray(newSteps)) throw new Error(batch.error || 'No steps returned');

      sop.steps = newSteps;
      renderEditor(); renderPreview(sop); renderJSON(sop);
      toast('Steps enhanced');
    } catch(err){
      console.error(err);
      toast('Enhance failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
      if (spinner) spinner.style.display = 'none';
    }
  });
})();

  // ===== Templates library (sidebar “Quick templates”) =====
  const TEMPLATE_LIBRARY = {
    onboarding: {
      title: "New Employee Onboarding",
      summary: "Welcome, access, IT/security, buddy assignment, and first-week goals.",
      steps: [
        "Send welcome email with start date and checklist",
        "Provision accounts (email, SSO, tools)",
        "IT & security setup (2FA, password manager)",
        "Assign buddy and schedule intro call",
        "Share first-week goals and resources"
      ]
    },
    agency_client_onboarding: {
      title: "Client Onboarding (Agency)",
      summary: "Kickoff, asset collection, tracking, approvals, weekly cadence.",
      steps: [
        "Schedule kickoff and confirm stakeholders",
        "Collect brand assets and credentials",
        "Implement analytics & conversion tracking",
        "Define deliverables and approval workflow",
        "Set standing weekly cadence and reporting"
      ]
    },
    minor_outage: {
      title: "Minor Website Outage",
      summary: "Triage, communicate, rollback if needed, verify, and log.",
      steps: [
        "Acknowledge incident and create ticket",
        "Triage scope and impact (pages, users, regions)",
        "Roll back recent changes if correlated",
        "Verify recovery and monitor metrics",
        "Post-incident notes and follow-ups"
      ]
    },
    google_ads_weekly: {
      title: "Google Ads Weekly Routine",
      summary: "Search terms, negatives, budgets, tests, reporting, and logging.",
      steps: [
        "Review search terms and add negatives",
        "Rebalance budgets by CPA/ROAS",
        "Refresh ad copy and RSAs tests",
        "Export performance report and email stakeholder",
        "Log changes and next actions"
      ]
    },
    bug_triage: {
      title: "Bug Triage & Handoff",
      summary: "Repro, severity, labeling, assignment, ETA, and customer update.",
      steps: [
        "Reproduce issue with clear steps",
        "Assign severity & labels",
        "Attach logs / screenshots",
        "Assign owner and ETA",
        "Update customer and link ticket"
      ]
    },
    sales_discovery: {
      title: "Sales Discovery Call",
      summary: "Prep agenda, qualify needs, next steps, and CRM update.",
      steps: [
        "Prep agenda & research account",
        "Run discovery and qualify",
        "Identify stakeholders & timeline",
        "Agree on next steps",
        "Update CRM and share recap"
      ]
    }
  };

  function renderQuickTemplates(){
    const list = document.getElementById('qtpl-list');
    if(!list || typeof TEMPLATE_LIBRARY !== 'object') return;
    const picks = ['onboarding','agency_client_onboarding','minor_outage','google_ads_weekly'].filter(k => TEMPLATE_LIBRARY[k]);
    list.innerHTML = picks.map(k => {
      const t = TEMPLATE_LIBRARY[k];
      return `<button class="qtpl-btn" data-template="${k}">${t.title}</button>`;
    }).join('');
  }
  renderQuickTemplates();

  // Clicks in the sidebar quick templates
  document.querySelector('.aside')?.addEventListener('click', (e)=>{
    const b = e.target.closest('.qtpl-btn');
    if(!b) return;
    const key = b.getAttribute('data-template');
    const t = TEMPLATE_LIBRARY[key];
    if(!t) return;

    const sop = { id: makeId(), title: t.title, summary: t.summary, steps: t.steps.slice() };
    sops.unshift(sop); active = sop.id;

    document.querySelector('[data-tab="editor"]')?.click();
    renderEditor(); toast('Template added');
  });

  // Clicks on any (future) #templates section buttons (defensive)
  document.getElementById('templates')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-template]');
    if (!btn) return;
    const key = btn.getAttribute('data-template');
    const t = TEMPLATE_LIBRARY[key];
    if (!t) { toast('Template not found'); return; }
    const sop = { id: makeId(), title: t.title, summary: t.summary, steps: t.steps.slice() };
    sops.unshift(sop); active = sop.id;
    document.querySelector('[data-tab="editor"]')?.click();
    renderEditor(); toast('Template added');
  });

  // Restore Version
  document.getElementById('versions-list')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-restore]');
    if (!btn) return;
    const verN = parseInt(btn.getAttribute('data-restore'), 10);
    const sop = sops.find(s=>s.id===active);
    if (!sop || !Array.isArray(sop.versions)) { toast('No versions'); return; }
    const v = sop.versions.find(x=>x.n === verN);
    if (!v) { toast('Version not found'); return; }
    sop.title   = v.title   || 'Untitled';
    sop.summary = v.summary || '';
    sop.steps   = (v.steps || []).map(t => (typeof t === 'string' ? t : (t?.title || '')));
    renderEditor();
    document.querySelector('[data-tab="editor"]')?.click();
    toast('Restored v'+verN);
  });

  // Initial demo document
  const demo = { id: makeId(), title:"New Employee Onboarding", summary:"Welcome, access, buddy, tools, first-week goals.", steps:["Send welcome email","Provision accounts","IT & security checklist","Assign buddy & intro call","First week goals"] };
  sops = [demo]; active=demo.id; renderEditor();
  /* === How steps: measure line === */
(function(){
  const wrap = document.getElementById('how-steps'); if(!wrap) return;
  const steps = Array.from(wrap.querySelectorAll('.hstep'));

  function setActive(n){
    steps.forEach((btn, i) => {
      const on = i === n;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-current', on ? 'step' : 'false');
    });
  }

  let current = steps.findIndex(b => b.classList.contains('active'));
  if (current < 0) current = 0; setActive(current);

  function measureRail(){
    const firstDot = steps[0]?.querySelector('.dot');
    const lastDot  = steps[steps.length-1]?.querySelector('.dot');
    if(!firstDot || !lastDot) return;
    const host = wrap; const hostRect = host.getBoundingClientRect();
    const f = firstDot.getBoundingClientRect(); const l = lastDot.getBoundingClientRect();
    const top    = Math.round((f.top + f.height/2) - hostRect.top);
    const bottom = Math.round(hostRect.bottom - (l.top + l.height/2));
    host.style.setProperty('--lineTop', `${top}px`);
    host.style.setProperty('--lineBottom', `${bottom}px`);
  }

  window.addEventListener('load', measureRail);
  window.addEventListener('resize', measureRail);
  setTimeout(measureRail, 0);
})();

/* === How steps: swap GIF on click === */
(function(){
  const wrap = document.getElementById('how-steps'); if(!wrap) return;
  const buttons = wrap.querySelectorAll('.hstep');
  const shot = document.querySelector('.hshot');
  const img  = shot ? shot.querySelector('img') : null;
  const ph   = shot ? shot.querySelector('.ph') : null;

  function showPlaceholder(){ if(!img) return; img.style.display='none'; if(ph) ph.style.display='grid'; }
  function showSrc(src){
    if(!img) return; if(!src){ showPlaceholder(); return; }
    img.onload  = ()=>{ img.style.display='block'; if(ph) ph.style.display='none'; };
    img.onerror = showPlaceholder;
    img.src = src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now();
  }

  buttons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      buttons.forEach(b=>{ b.classList.remove('active'); b.removeAttribute('aria-current'); });
      btn.classList.add('active'); btn.setAttribute('aria-current','step');
      showSrc(btn.dataset.gif || '');
    });
  });

  const activeBtn = wrap.querySelector('.hstep.active');
  if(activeBtn) showSrc(activeBtn.dataset.gif || '');
})();
  /* === Pricing period toggle === */
(function(){
  const tgl  = document.getElementById('billToggle');
  const grid = document.getElementById('pricingGrid');
  if(!tgl || !grid) return;

  function setPeriod(isAnnual){
    grid.querySelectorAll('.pcard').forEach(card=>{
      const m = parseFloat(card.getAttribute('data-month')||'0');
      const y = parseFloat(card.getAttribute('data-year') || m);
      const amtEl = card.querySelector('.amt');
      const perEl = card.querySelector('.per');
      const val = isAnnual ? y : m;
      if(amtEl) amtEl.textContent = '$' + (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1));
      if(perEl) perEl.textContent = isAnnual ? '/mo (billed yearly)' : '/mo';
    });
  }

  setPeriod(false);
  tgl.addEventListener('change', ()=> setPeriod(tgl.checked));
})();
  /* === FAQ accordion === */
(function(){
  const faq = document.querySelector('.faq'); if(!faq) return;
  const btns = faq.querySelectorAll('.acc-btn');

  function closeOthers(current){
    btns.forEach(btn => {
      if(btn !== current){
        btn.setAttribute('aria-expanded','false');
        btn.parentElement.classList.remove('open');
        const p = btn.nextElementSibling;
        if (p) p.style.maxHeight = 0;
      }
    });
  }

  btns.forEach(btn => {
    const panel = btn.nextElementSibling;
    if(btn.getAttribute('aria-expanded') === 'true'){
      btn.parentElement.classList.add('open');
      if(panel) panel.style.maxHeight = panel.scrollHeight + 'px';
    }
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      if(expanded){
        btn.setAttribute('aria-expanded','false');
        btn.parentElement.classList.remove('open');
        if(panel) panel.style.maxHeight = 0;
      }else{
        closeOthers(btn);
        btn.setAttribute('aria-expanded','true');
        btn.parentElement.classList.add('open');
        if(panel) panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });

  window.addEventListener('resize', () => {
    faq.querySelectorAll('.acc-btn[aria-expanded="true"]').forEach(btn => {
      const p = btn.nextElementSibling;
      if (p) p.style.maxHeight = p.scrollHeight + 'px';
    });
  });
})();
})();
