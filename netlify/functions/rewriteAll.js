// /netlify/functions/rewriteAll.js
import OpenAI from "openai";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const { steps, sopTitle = "", sopSummary = "" } = JSON.parse(event.body || "{}");

    if (!Array.isArray(steps) || steps.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing steps array" }) };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
You enhance an ENTIRE SOP at once. Return JSON ONLY with key "steps" (array).
For each step output an object with:
  "title": short imperative title,
  "details": "1–3 sentence helpful expansion",
  "ownerRole": string (likely role or empty string),
  "durationMin": integer minutes or null,
  "riskNotes": optional short warning if relevant (else omit).

Rules:
- Keep the SAME number of steps and the same broad meaning/order.
- Be crisp, practical, non-fluffy. Avoid repeating the summary.
- Use null for durationMin if unknown.
- If input step is already an object, improve it; if it is a string, convert to object.
- Output strictly JSON via response_format json_object.
`.trim();

    const user = {
      sopTitle,
      sopSummary,
      steps
    };

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
      ]
    });

    const content = resp.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { statusCode: 502, body: JSON.stringify({ error: "Bad JSON from model" }) };
    }

    const improved = Array.isArray(parsed?.steps) ? parsed.steps : null;
    if (!improved) {
      return { statusCode: 502, body: JSON.stringify({ error: "Model missing steps array" }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: improved })
    };
  } catch (err) {
    console.error("rewriteAll error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
}
