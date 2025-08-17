// netlify/functions/rewriteStep.js
import OpenAI from "openai";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    const { step = "", sopTitle = "", sopSummary = "" } = JSON.parse(event.body || "{}");
    if (!step.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing step" }) };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
You enhance a single SOP step. Return ONLY JSON:

{
  "details": "1-3 sentence helpful expansion",
  "ownerRole": "likely role or empty string",
  "durationMin": 0
}
Use null for durationMin if unknown. Keep it crisp & practical.
`;

    const user = `
SOP: ${sopTitle}
Summary: ${sopSummary}
Step: ${step}
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

    const out = JSON.parse(resp.choices?.[0]?.message?.content || "{}");
    const details = typeof out.details === "string" ? out.details : "";
    const ownerRole = typeof out.ownerRole === "string" ? out.ownerRole : "";
    const durationMin = Number.isFinite(+out.durationMin) ? Math.max(0, Math.round(+out.durationMin)) : null;

    return { statusCode: 200, body: JSON.stringify({ details, ownerRole, durationMin }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 502, body: JSON.stringify({ error: "Rewrite failed" }) };
  }
}
