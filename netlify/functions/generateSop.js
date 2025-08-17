// netlify/functions/generateSop.js
/* Generates a full SOP from rough notes (title + optional bullets/summary).
   Returns: { sop: { title, summary, steps[] } } and never crashes (no 502). */
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { inputText, overrideTitle } = JSON.parse(event.body || '{}');
    const notes = String(inputText || '').trim();

    if (!notes) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'inputText is required' }) };
    }
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
    }

    // Helper: simple local fallback if OpenAI fails
    const fallbackFromNotes = (raw, forcedTitle) => {
      const lines = String(raw).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      let title = (forcedTitle || '');
      if (!title) {
        const tLine = lines.find(l => /^title\s*:/i.test(l));
        title = tLine ? tLine.replace(/^title\s*:/i, '').trim() : lines[0] || 'Untitled SOP';
      }
      const bulletRx = /^(\d+[\.\)]\s+|[-*]\s+)/;
      const steps = lines.filter(l => bulletRx.test(l)).map(l => l.replace(bulletRx, '').trim());
      const summary = lines
        .filter(l => !bulletRx.test(l) && !/^title\s*:/i.test(l))
        .slice(0, 3)
        .join(' — ')
        .slice(0, 240);

      const out = {
        title,
        summary,
        steps: (steps.length ? steps : ['Plan the work', 'Perform the work', 'Review & finalize'])
          .map(s => ({ title: s }))
      };
      return sanitize(out);
    };

    // Helper: sanitize shape
    const sanitize = (sop) => {
      const safeTitle = String(sop?.title || 'Untitled SOP').slice(0, 200);
      const safeSummary = typeof sop?.summary === 'string' ? sop.summary.slice(0, 600) : '';
      const rawSteps = Array.isArray(sop?.steps) ? sop.steps : [];
      const steps = rawSteps
        .map(st => (typeof st === 'string' ? { title: st } : st))
        .filter(st => st && String(st.title || '').trim())
        .map(st => ({
          title: String(st.title || '').slice(0, 300),
          details: typeof st.details === 'string' ? st.details.slice(0, 1200) : '',
          ownerRole: typeof st.ownerRole === 'string' ? st.ownerRole.slice(0, 120) : '',
          durationMin: (typeof st.durationMin === 'number' && st.durationMin >= 0) ? st.durationMin : null
        }));
      return { title: safeTitle, summary: safeSummary, steps };
    };

    // Build the prompt
    const sys = [
      'You are an SOP generator.',
      'Return ONLY a JSON object with fields: title, summary, steps[].',
      'Each step should be an object { title, details?, ownerRole?, durationMin? }.',
      'Prefer 5–9 concise steps. No markdown, no commentary.'
    ].join(' ');
    const user = JSON.stringify({
      overrideTitle: String(overrideTitle || '').trim(),
      notes
    });

    // Call OpenAI Chat Completions with JSON mode
    const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content:
              'From the following notes, produce a clean SOP JSON. ' +
              'If "overrideTitle" is non-empty, use it exactly as the title. ' +
              'Otherwise infer from a "Title:" line or the content. ' +
              'Include a short summary. Keep steps clear and action-based. ' +
              user
          }
        ]
      })
    });

    const oaJson = await oaRes.json().catch(() => ({}));
    if (!oaRes.ok) {
      // OpenAI returned an error (don’t crash — return friendly 502)
      console.error('OpenAI error:', oaRes.status, oaJson);
      const sop = fallbackFromNotes(notes, overrideTitle);
      return { statusCode: 502, headers, body: JSON.stringify({ warning: 'OpenAI error', sop }) };
    }

    const text = oaJson?.choices?.[0]?.message?.content || '';
    let sop;
    try {
      sop = JSON.parse(text);
    } catch (e) {
      console.error('JSON parse failed, using fallback. Raw:', text?.slice?.(0, 400));
      sop = null;
    }

    if (!sop || !sop.title) {
      sop = fallbackFromNotes(notes, overrideTitle);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ sop: sanitize(sop) }) };

  } catch (err) {
    console.error('generateSop crash:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error (generateSop).' }) };
  }
};
