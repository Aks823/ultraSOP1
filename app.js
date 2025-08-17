// UltraSOP Front‑End Demo (no backend) — data persisted to localStorage
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const toast = (msg) => {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 1300);
};

// --- State ---
const initialSops = [
  {
    id: crypto.randomUUID(),
    title: "Weekly Blog Publishing",
    summary: "Draft to publish with QA and checklist.",
    steps: [
      "Open CMS draft and set status to 'Ready for review'",
      "Run Grammarly and fix critical issues",
      "Add 2 internal and 2 external links",
      "Insert hero image with alt text",
      "Publish and verify live URL"
    ],
    updatedAt: new Date().toISOString(),
    versions: [
      { id: crypto.randomUUID(), n: 1, at: new Date().toISOString(), titles:["Open CMS draft","Run Grammarly","Add links","Insert hero","Publish"] }
    ]
  },
  {
    id: crypto.randomUUID(),
    title: "New Employee Onboarding",
    summary: "Accounts, security, and welcome tasks.",
    steps: [
      "Create email + Slack account",
      "Grant access to Notion & GitHub",
      "Send security checklist",
      "Schedule intro meeting",
      "Assign onboarding buddy"
    ],
    updatedAt: new Date().toISOString(),
    versions: [
      { id: crypto.randomUUID(), n: 1, at: new Date().toISOString(), titles:["Create email","Grant access","Security checklist","Intro meeting","Assign buddy"] }
    ]
  },
  {
    id: crypto.randomUUID(),
    title: "Monthly Reporting",
    summary: "Collect metrics and send to stakeholders.",
    steps: [
      "Export analytics dashboard to CSV",
      "Update KPIs in template",
      "Write 3‑bullet highlights",
      "Attach charts as images",
      "Email to leadership list"
    ],
    updatedAt: new Date().toISOString(),
    versions: [
      { id: crypto.randomUUID(), n: 1, at: new Date().toISOString(), titles:["Export analytics","Update KPIs","Highlights","Attach charts","Email"] }
    ]
  }
];

const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem("ultrasop:data")) || initialSops;
    } catch { return initialSops; }
  },
  set(data){
    localStorage.setItem("ultrasop:data", JSON.stringify(data));
  }
};

let sops = store.get();
let activeId = sops[0]?.id || null;

// Keep multiple tabs in sync
window.addEventListener("storage", (e) => {
  if (e.key !== "ultrasop:data") return;
  try {
    sops = JSON.parse(e.newValue) || [];
    if (activeId && !sops.find(s => s.id === activeId)) {
      activeId = sops[0]?.id || null;
    }
    // Re-render whichever tab is visible
    if (document.querySelector("#tab-editor.is-visible")) {
      renderEditor();
    } else if (document.querySelector("#tab-versions.is-visible")) {
      renderVersions();
    } else {
      renderDashboard();
    }
  } catch {}
});

// --- Tabs ---
function showTab(name){
  $$(".app__nav").forEach(b=>b.classList.toggle("is-active", b.dataset.tab === name));
  $$(".tab").forEach(t=>t.classList.toggle("is-visible", t.id === `tab-${name}`));
  if(name==="dashboard") renderDashboard();
  if(name==="editor") renderEditor();
  if(name==="versions") renderVersions();
}
$$(".app__nav").forEach(btn=>btn.addEventListener("click", ()=>showTab(btn.dataset.tab)));
showTab("dashboard");

// --- Dashboard ---
function renderDashboard(){
   q = $("#search").value.trim().toLowerCase();
   container = $("#tab-dashboard .grid");
  container.innerHTML = "";
  sops
    .filter(s => !q || s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q))
    .sort((a,b)=> new Date(b.updatedAt)-new Date(a.updatedAt))
    .forEach(s => {
       el = document.createElement("article");
      el.className = "card card--sop pop";
      el.innerHTML = `
        <div class="chip">v${(s.versions.at(-1)?.n) || 1}</div>
        <h4>${s.title}</h4>
        <div class="meta">${s.steps.length} steps · Updated ${new Date(s.updatedAt).toLocaleDateString()}</div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn btn--outline" data-open="${s.id}">Open</button>
          <button class="btn btn--ghost" data-del="${s.id}" aria-label="Delete ${s.title}">Delete</button>
        </div>
      `;
      container.appendChild(el);
    });

  // Bind
  container.querySelectorAll("[data-open]").forEach(b=>{
    b.addEventListener("click", () => {
      activeId = b.getAttribute("data-open");
      showTab("editor");
    });
  });
  
  container.querySelectorAll("[data-del]").forEach(b=>{
  b.addEventListener("click", () => {
    const id = b.getAttribute("data-del");

    // >>> INSERTED: fix active pointer on delete
    const wasActive = id === activeId;
    sops = sops.filter(s => s.id !== id);
    if (wasActive) {
      activeId = sops[0]?.id || null;
    }
    // <<<

    // Guard against deleting the last SOP – keep a blank draft so the UI stays usable
if (sops.length === 0) {
  const blank = {
    id: crypto.randomUUID(),
    title: "",
    summary: "",
    steps: [],
    updatedAt: new Date().toISOString(),
    versions: []
  };
  sops = [blank];
  activeId = blank.id;
}

    store.set(sops);
    toast("Deleted");
    renderDashboard();
  });
});
}
$("#search").addEventListener("input", renderDashboard);
$("#btn-new").addEventListener("click", ()=>{
  const title = prompt("New SOP title?") || "Untitled SOP";
  const sop = { id: crypto.randomUUID(), title, summary:"", steps:[], updatedAt:new Date().toISOString(), versions:[] };
  sops.unshift(sop);
  store.set(sops);
  activeId = sop.id;
  showTab("editor");
  requestAnimationFrame(()=> $("#sop-title")?.focus()); // focus title
  toast("Created");
});

// --- Editor ---
function renderEditor(){
   sop = sops.find(s=>s.id===activeId) || sops[0];
  if(!sop) return;
  $("#sop-title").value = sop.title;
  $("#sop-summary").value = sop.summary;
   ul = $("#steps-list");
  ul.innerHTML = "";
  sop.steps.forEach((t,i)=>{
     li = document.createElement("li");
    li.className = "step";
    li.innerHTML = `
      <span class="step__index">${i+1}</span>
      <input value="${t.replace(/"/g,'&quot;')}" aria-label="Step ${i+1} text" />
      <span class="step__actions">
        <button title="Move up" data-up="${i}">↑</button>
        <button title="Move down" data-down="${i}">↓</button>
        <button title="Delete" data-rm="${i}">✕</button>
      </span>
    `;
    ul.appendChild(li);
  });

  // Bind edits
  ul.querySelectorAll("input").forEach((inp, idx) => {
    inp.addEventListener("input", (e)=>{
      sop.steps[idx] = e.target.value;
      sop.updatedAt = new Date().toISOString();
      store.set(sops);
      renderPreview(sop);
    });
  });

  // Press Enter on the last input to add a new step
const inputs = ul.querySelectorAll("input");
inputs.forEach((inp, idx) => {
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && idx === inputs.length - 1) {
      e.preventDefault();
      sop.steps.push("");
      sop.updatedAt = new Date().toISOString();
      store.set(sops);
      renderEditor();
      // focus the new input
      requestAnimationFrame(() => ul.querySelector("li.step:last-child input")?.focus());
    }
  });
});
  
  ul.querySelectorAll("[data-up]").forEach(btn => btn.addEventListener("click", ()=>{
     i = +btn.getAttribute("data-up");
    if(i===0) return;
     tmp = sop.steps[i-1]; sop.steps[i-1] = sop.steps[i]; sop.steps[i] = tmp;
    sop.updatedAt = new Date().toISOString();
    store.set(sops);
    renderEditor();
  }));
  ul.querySelectorAll("[data-down]").forEach(btn => btn.addEventListener("click", ()=>{
     i = +btn.getAttribute("data-down");
    if(i>=sop.steps.length-1) return;
     tmp = sop.steps[i+1]; sop.steps[i+1] = sop.steps[i]; sop.steps[i] = tmp;
    sop.updatedAt = new Date().toISOString();
    store.set(sops);
    renderEditor();
  }));
  ul.querySelectorAll("[data-rm]").forEach(btn => btn.addEventListener("click", ()=>{
     i = +btn.getAttribute("data-rm");
    sop.steps.splice(i,1);
    sop.updatedAt = new Date().toISOString();
    store.set(sops);
    renderEditor();
  }));

  $("#sop-title").oninput = (e)=>{
    sop.title = e.target.value; sop.updatedAt = new Date().toISOString(); store.set(sops); renderPreview(sop);
  };
  $("#sop-summary").oninput = (e)=>{
    sop.summary = e.target.value; sop.updatedAt = new Date().toISOString(); store.set(sops); renderPreview(sop);
  };

  $("#btn-add-step").onclick = ()=>{
    sop.steps.push("New step…");
    sop.updatedAt = new Date().toISOString();
    store.set(sops);
    renderEditor();
    toast("Step added");
  };
  $("#btn-clear").onclick = ()=>{
    if(confirm("Clear title, summary and steps?")){
      sop.title = ""; sop.summary = ""; sop.steps = [];
      sop.updatedAt = new Date().toISOString();
      store.set(sops);
      renderEditor();
      toast("Cleared");
    }
  };
  $("#btn-save-version").onclick = ()=>{
     last = sop.versions.at(-1);
     nextN = (last?.n || 0) + 1;
     titles = sop.steps.map(t=>t.trim().split(". ")[0]);
    sop.versions.push({ id: crypto.randomUUID(), n: nextN, at: new Date().toISOString(), titles });
    sop.updatedAt = new Date().toISOString();
    store.set(sops);
    toast(`Saved v${nextN}`);
    renderVersions();
  };

  renderPreview(sop);
}
function renderPreview(sop){
  $("#preview").innerHTML = `
    <h4 class="pv-title">${sop.title || "Untitled SOP"}</h4>
    <p class="pv-summary">${sop.summary || "No summary yet."}</p>
    <div class="pv-steps">
      ${sop.steps.map((t,i)=>`
        <div class="pv-step">
          <strong>Step ${i+1}:</strong> ${t || "<em>…</em>"}
        </div>
      `).join("")}
    </div>
  `;
}

// --- Versions ---
function renderVersions(){
   sop = sops.find(s=>s.id===activeId) || sops[0];
  if(!sop) return;
   ul = $("#versions-list");
  ul.innerHTML = "";
  sop.versions.forEach(v=>{
     li = document.createElement("li");
    li.className = "ver";
    li.innerHTML = `
      <div><strong>v${v.n}</strong> · ${new Date(v.at).toLocaleString()}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn--outline" data-diff="${v.id}">Diff</button>
        <button class="btn btn--ghost" data-delv="${v.id}">Delete</button>
      </div>
    `;
    ul.appendChild(li);
  });

  ul.querySelectorAll("[data-diff]").forEach(b=>b.addEventListener("click", ()=>{
     id = b.getAttribute("data-diff");
     idx = sop.versions.findIndex(x=>x.id===id);
    if(idx<=0){ $("#diff-out").textContent = "No previous version to compare."; return; }
     prev = sop.versions[idx-1].titles;
     cur = sop.versions[idx].titles;
     out = [];
    // naive diff
    cur.forEach(t => { if(!prev.includes(t)) out.push(`<div class="diff-add">+ ${t}</div>`); });
    prev.forEach(t => { if(!cur.includes(t)) out.push(`<div class="diff-del">− ${t}</div>`); });
    $("#diff-out").innerHTML = out.join("") || "No changes in titles.";
  }));

  ul.querySelectorAll("[data-delv]").forEach(b=>b.addEventListener("click", ()=>{
    const id = b.getAttribute("data-delv");
    sop.versions = sop.versions.filter(v=>v.id!==id);
    store.set(sops);
    renderVersions();
  }));
}

// --- Settings ---
$("#toggle-compact").addEventListener("change", (e)=>{
  document.body.style.setProperty("--radius", e.target.checked ? "8px" : "12px");
  toast(e.target.checked ? "Compact on" : "Compact off");
});

// --- Misc ---
$("#year").textContent = new Date().getFullYear();

// Initialize
renderDashboard();
