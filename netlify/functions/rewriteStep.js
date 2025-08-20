// /netlify/functions/rewriteStep.js
export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const { step = "", sopTitle = "", sopSummary = "", detail = "full" } = JSON.parse(event.body || "{}");
    if (!step.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing step" }) };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
    }

    const wordHint =
      detail === "preview" ? "80–120" : detail === "rich" ? "200–260" : "150–220";

    const system = `
You enhance a single SOP step. Return ONLY JSON:
{
  "title": "short imperative title (keep meaning)",
  "details": "1–3 sentence synopsis",
  "longform": "${wordHint} words of step-by-step guidance",
  "ownerRole": "likely role or empty string",
  "durationMin": null or integer minutes,
  "checklist": ["bulletized sub-tasks"] (optional),
  "prerequisites": ["what's needed before"] (optional),
  "acceptanceCriteria": ["definition of done"] (optional),
  "tools": ["tools/systems"] (optional),
  "references": ["links or doc titles"] (optional),
  "risks": ["warnings or gotchas"] (optional)
}
Use null for durationMin if unknown. Be crisp & practical.
`.trim();

    const user = `SOP: ${sopTitle}\nSummary: ${sopSummary}\nStep: ${step}`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      const msg = data?.error?.message || `OpenAI error (${resp.status})`;
      return { statusCode: resp.status, body: JSON.stringify({ error: msg }) };
    }

    const raw = data?.choices?.[0]?.message?.content || "{}";
    let obj;
    try { obj = JSON.parse(raw); } catch { obj = {}; }

    const out = {
      title: obj.title || step,
      details: obj.details || "",
      longform: obj.longform || "",
      ownerRole: obj.ownerRole || "",
      durationMin: (obj.durationMin === 0 || obj.durationMin) ? Number(obj.durationMin) : null,
      checklist: Array.isArray(obj.checklist) ? obj.checklist : [],
      prerequisites: Array.isArray(obj.prerequisites) ? obj.prerequisites : [],
      acceptanceCriteria: Array.isArray(obj.acceptanceCriteria) ? obj.acceptanceCriteria : [],
      tools: Array.isArray(obj.tools) ? obj.tools : [],
      references: Array.isArray(obj.references) ? obj.references : [],
      risks: Array.isArray(obj.risks) ? obj.risks : (obj.riskNotes ? [obj.riskNotes] : [])
    };

    return { statusCode: 200, body: JSON.stringify({ step: out }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Server error" }) };
  }
}
