// netlify/functions/generateSop.js
// Node 18+, CommonJS (default for Netlify functions). Requires OPENAI_API_KEY.

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';


const MODEL = process.env.ULTRASOP_MODEL || "gpt-4o-mini";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = {};



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

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, body: "Missing OPENAI_API_KEY" };
    }
    // ... (rest of your existing code unchanged) ...
      // Verify Supabase JWT and enforce rate limiting
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
    const userId = user.id;
    const now = Date.now();
    if (!rateLimitMap[userId]) rateLimitMap[userId] = [];
    // remove timestamps outside the window
    rateLimitMap[userId] = rateLimitMap[userId].filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (rateLimitMap[userId].length >= RATE_LIMIT_MAX) {
      return { statusCode: 429, body: 'Too Many Requests' };
    }
    rateLimitMap[userId].push(now);
} 
  

atch (err) {
    console.error("generateSop error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Server error" }),
    };
  }
}
