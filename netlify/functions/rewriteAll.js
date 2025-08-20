// /netlify/functions/rewriteAll.js
import OpenAI from "openai";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const body = JSON.parse(event.body || "{}");
    const { steps, sopTitle = "", sopSummary = "", detail = "full" } = body;

    if (!Array.isArray(steps) || steps.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing steps array" }) };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const wordHint =
      detail === "preview"
        ? "80–120"
        : detail === "rich"
        ? "200–260"
        : "150–220"; // “full”

    const system = `
You enhance an ENTIRE SOP at once. Return JSON ONLY with key "steps" (array of objects).
Keep the SAME number of steps and original meaning/order.

For each step, output:
{
  "title": "short imperative title",
  "details": "1–3 sentence synopsis (for on-screen preview)",
  "longform": "${wordHint} words of clear procedural guidance",
  "ownerRole": "likely role or empty string",
  "durationMin": integer minutes or null,
  "checklist": ["concrete, actionable bullets"] (optional),
  "prerequisites": ["things needed before starting"] (optional),
  "acceptanceCriteria": ["definition of done"] (optional),
  "tools": ["tools, systems, documents"] (optional),
  "references": ["links or doc titles"] (optional),
  "risks": ["caveats or safety notes"] (optional)
}

Rules:
- Be crisp and practical. No fluff.
- Use null for durationMin if unknown.
- If input step is a string, convert to object.
- Output STRICT JSON via response_format=json_object.
`.trim();

    const user = { sopTitle, sopSummary, steps };

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
      ]
    });

    const content = resp.choices?.[0]?.message?.content || "{}";
    let parsed;
    try { parsed = JSON.parse(content); } catch {
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
