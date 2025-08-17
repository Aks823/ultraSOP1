// netlify/functions/generateSop.js
import OpenAI from "openai";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { inputText = "", overrideTitle = "" } = JSON.parse(event.body || "{}");
    if (!inputText.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing inputText" }) };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
You are UltraSOP, an assistant that turns rough notes into **structured SOP JSON**.

Return **ONLY JSON** (no prose) with this exact shape:

{
  "title": "string",
  "summary": "1-2 sentence summary",
  "steps": [
    {
      "title": "short, imperative step",
      "details": "1-3 sentence expansion (optional)",
      "ownerRole": "suggest likely role (e.g., Analyst, Manager) or empty string",
      "durationMin": 0,                // integer minutes or null
      "checklist": ["item 1","item 2"],// optional
      "prerequisites": ["item"],       // optional
      "riskNotes": "short warning"     // optional
    }
  ]
}

Rules:
- 5–9 steps usually best.
- Use integers for durationMin; omit or null if unknown.
- Be concise and actionable.
- If input contains a Title line, honor it unless overrideTitle is provided.
`;

    const user = `
Input:
${inputText}

Override title (may be empty): ${overrideTitle}
`;

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: user.trim() }
      ]
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let sop = JSON.parse(raw);

    // ---- Defensive normalization (never trust the model 100%) ----
    const toStr = v => (typeof v === "string" ? v : "");
    const toArr = v => (Array.isArray(v) ? v.filter(x => typeof x === "string" && x.trim()) : []);
    const toInt = v => (Number.isFinite(+v) ? Math.max(0, Math.round(+v)) : null);

    sop = {
      title: overrideTitle.trim() || toStr(sop.title) || "Untitled SOP",
      summary: toStr(sop.summary),
      steps: (Array.isArray(sop.steps) ? sop.steps : []).map(s => ({
        title: toStr(s?.title),
        details: toStr(s?.details),
        ownerRole: toStr(s?.ownerRole),
        durationMin: toInt(s?.durationMin),
        checklist: toArr(s?.checklist),
        prerequisites: toArr(s?.prerequisites),
        riskNotes: toStr(s?.riskNotes),
      })).filter(s => s.title)
    };

    return {
      statusCode: 200,
      body: JSON.stringify({ sop })
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Generation failed" })
    };
  }
}
