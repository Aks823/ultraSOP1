// netlify/functions/generateSop.js
// Node 18+, CommonJS (default for Netlify functions). Requires OPENAI_API_KEY.

const OpenAI = require("openai");

const MODEL = process.env.ULTRASOP_MODEL || "gpt-4o-mini";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Safely parse JSON from a model response that may have extra text */
function extractJsonBlock(text) {
  if (typeof text !== "string") throw new Error("Empty response");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
  const slice = text.slice(start, end + 1);
  return JSON.parse(slice);
}

/** Second-chance repair when JSON parse fails */
async function repairJson(raw) {
  const prompt = [
    { role: "system", content: "You are a strict JSON linter. Return ONLY valid JSON. No comments, no markdown, no explanations." },
    { role: "user", content: `Fix this to valid JSON (same structure):\n\n${raw}` }
  ];
  const r = await client.chat.completions.create({
    model: MODEL,
    messages: prompt,
    temperature: 0.0,
  });
  return extractJsonBlock(r.choices?.[0]?.message?.content || "");
}

/** Build the system + user prompts */
function buildPrompts({ title, summary, notesRaw, settings }) {
  const tone = settings?.tone || process.env.ULTRASOP_DEFAULT_TONE || "practical formal";
  const audience = settings?.audience || "internal operations";
  const detailLevel = settings?.detailLevel || process.env.ULTRASOP_DEFAULT_DETAIL || "standard";

  // Map detailLevel to word targets (used as guidance to the model)
  const wordHint = detailLevel === "rich" ? "180–250"
                    : detailLevel === "previewOnly" ? "80–120"
                    : "120–180";

  const system = [
    "You are an expert SOP author. Produce STRICT JSON that matches the schema.",
    "Audience: " + audience + ". Tone: " + tone + ".",
    "For each step:",
    `- details: a concise 1–3 sentence synopsis (for on-screen preview).`,
    `- longform: ${wordHint} words of clear, professional, instructional prose.`,
    "- Include where relevant: checklist, prerequisites, risks, acceptanceCriteria, tools, references.",
    "- Keep step count between 7 and 12 unless the source text dictates otherwise.",
    "Absolutely DO NOT include any text outside JSON.",
  ].join("\n");

  const user = [
    `Title: ${title || ""}`.trim(),
    `Summary/context: ${summary || ""}`.trim(),
    "Notes (raw; may be messy):",
    notesRaw || "",
    "",
    "Return JSON ONLY in this exact shape:",
    `{
  "title": "string",
  "summary": "string",
  "steps": [{
    "title": "string",
    "details": "string",
    "longform": "string",
    "ownerRole": "string optional",
    "durationMin": 0,
    "checklist": ["string"] optional,
    "prerequisites": ["string"] optional,
    "risks": ["string"] optional,
    "acceptanceCriteria": ["string"] optional,
    "tools": ["string"] optional,
    "references": ["string"] optional
  }]
}`
  ].join("\n");

  return { system, user, meta: { tone, audience, detailLevel } };
}

/** Light parser for "Title: ..." + bullets when old inputText is used */
function deriveFromInputText(raw, overrideTitle) {
  const lines = String(raw || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const titleLine = lines.find(l => /^title\s*:/i.test(l));
  const title = (overrideTitle || (titleLine ? titleLine.replace(/^title\s*:/i, "").trim() : "")) || "";
  const bullets = lines.filter(l => /^(\d+[\.\)]\s+|[-*]\s+)/.test(l)).map(l => l.replace(/^(\d+[\.\)]\s+|[-*]\s+)/, "").trim());
  const summary = lines.filter(l => !/^title\s*:/i.test(l) && !/^(\d+[\.\)]\s+|[-*]\s+)/.test(l)).slice(0, 3).join(" — ");

  return {
    title: title || (lines[0] || "Untitled SOP"),
    summary,
    notesRaw: raw,
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, body: "Missing OPENAI_API_KEY" };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    // Back-compat inputs
    const hasOld = typeof body.inputText === "string" || typeof body.overrideTitle === "string";
    let title = body.title;
    let summary = body.summary;
    let notesRaw = body.notesRaw;
    const settings = body.settings || {};

    if (hasOld) {
      const d = deriveFromInputText(body.inputText || "", body.overrideTitle || "");
      title = title || d.title;
      summary = summary || d.summary;
      notesRaw = notesRaw || d.notesRaw;
    }

    // Guardrail: need at least some content
    const hasAny = (title && title.trim()) || (summary && summary.trim()) || (notesRaw && notesRaw.trim());
    if (!hasAny) {
      return { statusCode: 400, body: JSON.stringify({ error: "No input provided" }) };
    }

    const { system, user } = buildPrompts({ title, summary, notesRaw, settings });

    // Main call
    const chat = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.25,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
    });

    let raw = chat.choices?.[0]?.message?.content || "";
    let json;
    try {
      json = extractJsonBlock(raw);
    } catch (e) {
      json = await repairJson(raw);
    }

    // Minimal normalization for back-compat
    if (!Array.isArray(json.steps)) json.steps = [];
    json.title = String(json.title || title || "Untitled SOP");
    json.summary = String(json.summary || summary || "");

    // Ensure fields exist per step
    json.steps = json.steps.map((s) => {
      const out = {
        title: String(s?.title || "").trim() || "Untitled step",
        details: String(s?.details || "").trim(),
        longform: String(s?.longform || "").trim(),
        ownerRole: s?.ownerRole || "",
        durationMin: (typeof s?.durationMin === "number" ? s.durationMin : null),
        checklist: Array.isArray(s?.checklist) ? s.checklist.map(String) : [],
        prerequisites: Array.isArray(s?.prerequisites) ? s.prerequisites.map(String) : [],
        risks: Array.isArray(s?.risks) ? s.risks.map(String) : [],
        acceptanceCriteria: Array.isArray(s?.acceptanceCriteria) ? s.acceptanceCriteria.map(String) : [],
        tools: Array.isArray(s?.tools) ? s.tools.map(String) : [],
        references: Array.isArray(s?.references) ? s.references.map(String) : [],
      };
      return out;
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sop: json }),
    };
  } catch (err) {
    console.error("generateSop error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Server error" }),
    };
  }
};
