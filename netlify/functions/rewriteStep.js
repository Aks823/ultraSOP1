// /netlify/functions/rewriteStep.js
import OpenAI from "openai";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const { step = "", sopTitle = "", sopSummary = "" } = JSON.parse(event.body || "{}");
    if (!step.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing step" }) };
    }
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
You enhance a single SOP step. Return ONLY JSON:
{
  "details": "1-3 sentence helpful expansion",
  "ownerRole": "likely role or empty string",
  "durationMin": null or integer minutes,
  "riskNotes": "brief risks or empty string"
}
Use null for durationMin if unknown. Keep it crisp & practical.`.trim();

    const user = `SOP: ${sopTitle}
Summary: ${sopSummary}
Step: ${step}`;

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let obj;
    try { obj = JSON.parse(raw); } catch { obj = {}; }

    const out = {
      details: obj.details || "",
      ownerRole: obj.ownerRole || "",
      durationMin: (obj.durationMin === 0 || obj.durationMin) ? Number(obj.durationMin) : null,
      riskNotes: obj.riskNotes || ""
    };

    return { statusCode: 200, body: JSON.stringify({ step: out }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Server error" }) };
  }
}
