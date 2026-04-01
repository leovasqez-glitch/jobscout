async function callClaude(system, messages) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'web-search-2025-03-05',
  };

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages,
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error ${resp.status}`);
  }

  return resp.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key no configurada. Agrégala en Vercel → Settings → Environment Variables.' });
  }

  try {
    const { messages, system } = req.body;
    if (!messages || !system) return res.status(400).json({ error: 'Faltan campos: messages y system son requeridos.' });

    let data = await callClaude(system, messages);
    let currentMessages = [...messages];
    let iterations = 0;

    // Handle tool use loop (max 5 iterations)
    while (data.stop_reason === 'tool_use' && iterations < 5) {
      iterations++;
      const toolResults = (data.content || [])
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: b.input?.query ? `Searching: ${b.input.query}` : 'Search done',
        }));

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: data.content },
        { role: 'user', content: toolResults },
      ];

      data = await callClaude(system, currentMessages);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}
