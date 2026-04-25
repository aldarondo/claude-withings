/**
 * External memory store integration — store and delete health memories.
 * Fails silently so it never breaks the primary tool response.
 *
 * Required env vars (optional — silently skips if absent):
 *   MEM_URL             URL of any MCP memory server (e.g. https://mem.example.com/mcp)
 *   MCP_CLIENT_ID       CF Access client ID (omit if no auth required)
 *   MCP_CLIENT_SECRET   CF Access client secret (omit if no auth required)
 */

function buildHeaders() {
  // brian-mem requires both content types; responds in SSE format
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (process.env.MCP_CLIENT_ID)     headers['CF-Access-Client-Id']     = process.env.MCP_CLIENT_ID;
  if (process.env.MCP_CLIENT_SECRET) headers['CF-Access-Client-Secret'] = process.env.MCP_CLIENT_SECRET;
  return headers;
}

// Parse MCP streamable-HTTP SSE response: extract JSON from the "data: {...}" line.
function parseSseJson(raw) {
  const line = raw.split('\n').find(l => l.startsWith('data: '));
  return line ? JSON.parse(line.slice(6)) : {};
}

/**
 * Store a memory. Returns the content hash on success, null on failure.
 * @param {string} content
 * @param {string} tags - comma-separated extra tags (appended after "health,withings,")
 * @returns {Promise<string|null>} content hash
 */
export async function storeMemory(content, tags = '') {
  const url = process.env.MEM_URL;
  if (!url) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: {
          name: 'memory_store',
          arguments: {
            content,
            conversation_id: 'withings-health',
            metadata: { tags: `health,withings,${tags}`.replace(/,+$/, ''), type: 'health_snapshot' },
          },
        },
      }),
    });
    const data  = parseSseJson(await res.text());
    const text  = data?.result?.content?.[0]?.text ?? '';
    const match = text.match(/hash:\s*([a-f0-9]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete a memory by its content hash (returned by storeMemory).
 * Best-effort — never throws.
 * @param {string} hash
 */
export async function deleteMemory(hash) {
  const url = process.env.MEM_URL;
  if (!url || !hash) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: {
          name: 'memory_delete',
          arguments: { content_hash: hash },
        },
      }),
    });
  } catch {
    // best-effort
  }
}
