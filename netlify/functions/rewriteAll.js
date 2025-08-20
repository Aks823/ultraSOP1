// /netlify/functions/rewriteAll.js
// Patched version with Supabase JWT verification and rate limiting

import OpenAI from "openai";
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key (no session persistence)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Simple in-memory rate limit configuration.  Adjust these values as needed.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window
const rateLimitMap = {};

export async function handler(event) {
  try {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    // Authenticate via Supabase JWT from the Authorization header
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }),
      };
    }
    const token = authHeader.split(' ')[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: Invalid token' }),
      };
    }
    const userId = user.id;
    // Rate limiting per user: track timestamps of requests
    const now = Date.now();
    const userRequests = rateLimitMap[userId] || [];
    // Remove timestamps outside the window
    rateLimitMap[userId] = userRequests.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
    if (rateLimitMap[userId].length >= RATE_LIMIT_MAX) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: 'Too many requests: Rate limit exceeded' }),
      };
    }
    // Record current request
    rateLimitMap[userId].push(now);

    // Parse request body after authentication
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

    const userData = { sopTitle, sopSummary, steps };

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userData) }
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
