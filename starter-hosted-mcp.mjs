// starter-hosted-mcp.mjs — FarmDash Hosted Remote MCP quickstart (zero install).
// Connects to https://www.farmdash.one/api/mcp over Streamable HTTP with plain fetch — no SDK, no build, no key (Scout tier).
// Verified live 2026-11-22: initialize → notifications/initialized → tools/list (100 tools in the full profile).
// Usage: node starter-hosted-mcp.mjs   (Node >= 18)

const ENDPOINT = 'https://www.farmdash.one/api/mcp';
let sessionId = null;
let nextId = 1;

async function rpc(method, params) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params: params ?? {} }),
  });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);

  // Streamable HTTP may answer as JSON or as an SSE frame — parse both.
  let payload = null;
  if (text.includes('data:')) {
    for (const line of text.split('\n')) {
      if (line.startsWith('data:')) {
        try { payload = JSON.parse(line.slice(5).trim()); } catch { /* skip keep-alives */ }
      }
    }
  } else {
    try { payload = JSON.parse(text); } catch { /* keep-alive or empty */ }
  }
  if (payload?.error) throw new Error('RPC error: ' + JSON.stringify(payload.error).slice(0, 300));
  return payload?.result ?? payload;
}

const init = await rpc('initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'farmdash-starter', version: '0.1.0' },
});
console.log(`server: ${init.serverInfo?.name} v${init.serverInfo?.version} (transport: streamable-http, session ${sessionId ? 'established' : 'stateless'})`);

await rpc('notifications/initialized');

const tools = await rpc('tools/list');
console.log(`tools listed: ${tools.tools.length}`);
console.log('sample:', tools.tools.slice(0, 6).map(t => t.name).join(', '));
console.log('next: call any tool keylessly at Scout tier (30 req/24h/IP) — e.g. agent_onboard, query_trail_heat, get_chain_breakdown.');
console.log('profiles: full (100 tools) · research (21) · spot-trader (19) · futures-trader (20) — append ?profile=spot-trader to the endpoint.');
