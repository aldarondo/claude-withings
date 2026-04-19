/**
 * brian-mem integration — fire-and-forget helper.
 * Stores health snapshots to brian-mem after each tool call.
 * Fails silently so it never breaks the primary tool response.
 *
 * Required env vars (optional — silently skips if absent):
 *   BRIAN_MEM_URL             e.g. https://brian.aldarondo.family/mcp
 *   BRIAN_MCP_CLIENT_ID       CF Access client ID
 *   BRIAN_MCP_CLIENT_SECRET   CF Access client secret
 */

export async function storeMemory(content, tags = '') {
  const url = process.env.BRIAN_MEM_URL;
  if (!url) return;

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.BRIAN_MCP_CLIENT_ID)     headers['CF-Access-Client-Id']     = process.env.BRIAN_MCP_CLIENT_ID;
  if (process.env.BRIAN_MCP_CLIENT_SECRET) headers['CF-Access-Client-Secret'] = process.env.BRIAN_MCP_CLIENT_SECRET;

  try {
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: {
          name: 'memory_store',
          arguments: {
            content,
            metadata: { tags: `health,withings,${tags}`.replace(/,+$/, ''), type: 'health_snapshot' },
          },
        },
      }),
    });
  } catch {
    // Never fail the caller — memory storage is best-effort
  }
}
