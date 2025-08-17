// netlify/functions/generateSop.js  (CommonJS, no extra deps)
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Use POST" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
    }

    const { inputText, overrideTitle } = JSON.parse(event.body || "{}");
    if (!inputText || !inputText.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "inputText required" }) };
    }

    const system = `You generate SOPs. Return JSON only with:
{
  "title": "",
  "summary": "",
  "steps": [ { "title":"", "details":"", "ownerRole":"", "durationMin": null } ]
}
5–9 concise steps, no markdown, no fences.`;

    // Chat Completions (works well with gpt-4o-mini)
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: inputText }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const details = await r.text();
      console.error("OpenAI error", r.status, details);
      return { statusCode: 502, body: JSON.stringify({ error: `OpenAI ${r.status}`, details }) };
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let sop = {};
    try { sop = JSON.parse(content); } catch (e) {
      console.error("JSON parse fail:", content);
      return { statusCode: 502, body: JSON.stringify({ error: "Bad JSON from model" }) };
    }

    if (overrideTitle) sop.title = overrideTitle;

    // light sanitation so your UI doesn’t choke
    if (!Array.isArray(sop.steps)) sop.steps = [];
    sop.steps = sop.steps.map(st => {
      if (typeof st === "string") return { title: st, details: "", ownerRole: "", durationMin: null };
      return {
        title: st.title || "",
        details: st.details || "",
        ownerRole: st.ownerRole || "",
        durationMin: Number.isFinite(st.durationMin) ? st.durationMin : null
      };
    });

    return { statusCode: 200, body: JSON.stringify({ sop }) };
  } catch (err) {
    console.error("Function crash:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

