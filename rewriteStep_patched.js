import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for authentication. We disable session persistence
// and automatic token refresh because this is a server-side environment.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Rate limiting configuration. Each user is allowed a maximum of RATE_LIMIT_MAX
// requests within a sliding window of RATE_LIMIT_WINDOW_MS milliseconds. Requests
// beyond that limit will return a 429 error.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const rateLimitMap = {};

export async function handler(event) {
  try {
    // Only allow POST requests. Other methods return a 405 error.
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Verify Authorization header and authenticate user via Supabase JWT.
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }),
      };
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: Invalid token' }),
      };
    }

    // Implement per-user rate limiting. Remove outdated timestamps, check current
    // usage, and update the request history for this user.
    const userId = user.id;
    const now = Date.now();
    const userRequests = rateLimitMap[userId] || [];
    rateLimitMap[userId] = userRequests.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
    if (rateLimitMap[userId].length >= RATE_LIMIT_MAX) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: 'Too many requests: Rate limit exceeded' }),
      };
    }
    rateLimitMap[userId].push(now);

    // Parse the input JSON. Provide default values for missing fields.
    const { step = '', sopTitle = '', sopSummary = '', detail = 'full' } = JSON.parse(event.body || '{}');

    if (!step.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing step' }) };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
    }

    // Determine the level of detail requested for the rewritten step.
    const wordHint = detail === 'summary'
      ? 'briefly summarize this step in one sentence.'
      : detail === 'medium'
      ? 'Write a summary in 2-3 sentences, with moderate details and clarity.'
      : 'Write a detailed long-form version, focusing on clarity and readability.';

    // System prompt instructing the model on the desired output format and style.
    const system = `
You are a helpful AI rewriting a single step in a Standard Operating Procedure (SOP). For the given step text, please improve the clarity, structure, and thoroughness while keeping the same context.
Return a valid JSON object with the following format: {"title": "...", "durationMin": ..., "acceptanceCriteria": ["...","...","..."], "tools": ["..."], "references": ["..."], "risks": ["..."], "longform": "..."}. The longform field should contain the ${wordHint}

You should preserve the original context and order of events while enhancing the clarity and completeness.
Title should be under 12 words, use sentence case, and not be enclosed in quotes. Provide acceptance criteria, tools, references, and risks lists, or an empty list [] if not applicable. The 'durationMin' should be a number.
Make acceptance criteria actionable and clear. Avoid using 'should' or 'the step'.
Feel free to combine simpler paragraphs into more cohesive sentences. Avoid generic pronouns.
If no specific tools/references/risks, leave empty list.
Never mention you're an AI.
Always return valid JSON only (no text outside JSON).
`;

    // Initialize the OpenAI client with the API key.
    const client = new OpenAI({ apiKey });

    // Call the OpenAI API via fetch. We set response_format to json_object so
    // the model returns only valid JSON.
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.25,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: step },
        ],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      const msg = data?.error?.message || `OpenAI error (${resp.status})`;
      return { statusCode: resp.status, body: JSON.stringify({ error: msg }) };
    }

    // Build the resulting step object, falling back to original values if the model omits fields.
    const stepObj = data || {};
    const resultStep = {
      title: stepObj.title || sopTitle,
      durationMin: stepObj.durationMin || null,
      acceptanceCriteria: Array.isArray(stepObj.acceptanceCriteria) ? stepObj.acceptanceCriteria : [],
      tools: Array.isArray(stepObj.tools) ? stepObj.tools : [],
      references: Array.isArray(stepObj.references) ? stepObj.references : [],
      risks: Array.isArray(stepObj.risks) ? stepObj.risks : [],
      longform: stepObj.longform || '',
    };

    return { statusCode: 200, body: JSON.stringify({ step: resultStep }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}