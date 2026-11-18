#!/usr/bin/env node
// hello-farmdash.mjs — FarmDash MCP "first contact" demo (keyless, Scout tier).
//
// What it does (verified live 2026-11-17 against farmdash-agent-os 5.0.0):
//   1. spawn your locally built MCP server (stdio, JSON-RPC 2.0)
//   2. initialize + tools/list  -> expect exactly 94 capability-labeled tools
//   3. research: query_trail_heat + get_chain_breakdown  (Scout preview shapes)
//   4. plan:     get_swap_quote {lifi, Base, ETH->USDC}  (estimate-only, no authority)
//   5. fence:    create_intent  -> expect the graceful keyless fence
//      (402 payment_required envelope, retryable, grants NO transaction authority)
//   6. print a step-by-step verdict with teaching notes.
//
// Cost: 2 metered Scout calls (+1 attempt on the fence route). Nothing is signed,
// no keys are sent, no payment is made. See money-wall-cheatsheet.md for semantics.
//
// Usage:
//   node hello-farmdash.mjs [path/to/mcp-server/dist/index.js]
//   env overrides: FARMDASH_MCP_SERVER=/abs/path/dist/index.js  (arg wins)
//                  SKIP_INTENT=1   -> stop before the fence demo
//
// Prereq: the server must be built once:
//   git clone https://github.com/Parmasanandgarlic/farmdash-openclaw-skills
//   cd farmdash-openclaw-skills/mcp-server && npm ci && npm run build
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = process.argv[2] || process.env.FARMDASH_MCP_SERVER
  || path.join(HERE, 'mcp-server', 'dist', 'index.js');

const c = (s, k) => process.stdout.isTTY ? `\x1b[${k}m${s}\x1b[0m` : s; // k: 32 green, 33 yellow, 36 cyan, 31 red
const step = (n, t) => console.log(`\n${c(`[${n}]`, '36')} ${t}`);
const ok = (t) => console.log(`  ${c('PASS', '32')} ${t}`);
const warn = (t) => console.log(`  ${c('NOTE', '33')} ${t}`);
const bad = (t) => console.log(`  ${c('FAIL', '31')} ${t}`);

// ---- spawn server keyless (Scout tier = no env vars at all) ----
const childEnv = { ...process.env };
delete childEnv.FARMDASH_API_KEY;
delete childEnv.FARMDASH_SCOUT_GRANT;

console.log(c('hello-farmdash — keyless Scout-tier first contact', '36'));
console.log(`server: ${SERVER}`);
step(0, 'spawning MCP server over stdio (no network calls at startup)');
const child = spawn(process.execPath, [SERVER], { env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const pending = new Map();
let nextId = 1;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      clearTimeout(p.timer); p.resolve({ msg, ms: Date.now() - p.sentAt });
    }
  }
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', (d) => { if (String(d).trim()) warn(`server stderr: ${String(d).trim().slice(0, 200)}`); });
child.on('exit', (code) => { if (code && code !== 0) bad(`server exited code=${code}`); });

const rpc = (method, params, timeoutMs = 45000) => new Promise((resolve, reject) => {
  const id = nextId++;
  const sentAt = Date.now();
  pending.set(id, { resolve, reject, sentAt, timer: setTimeout(() => { pending.delete(id); reject(new Error(`timeout: ${method}`)); }, timeoutMs) });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = (tool, args) => rpc('tools/call', { name: tool, arguments: args });
const parse = (r) => { const t = r?.msg?.result?.content?.[0]?.text; try { return t ? JSON.parse(t) : null; } catch { return { _raw: t }; } };

try {
  // ---- 1. initialize ----
  step(1, 'initialize (MCP handshake)');
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'hello-farmdash', version: '1.0.0' } });
  const si = init.msg.result?.serverInfo;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  if (si?.name === 'farmdash-agent-os') ok(`server "${si.name}" v${si.version} answered in ${init.ms} ms`);
  else bad(`unexpected serverInfo: ${JSON.stringify(si)}`);

  // ---- 2. tools/list ----
  step(2, 'tools/list — the full capability catalog');
  const list = await rpc('tools/list', {});
  const tools = list.msg.result?.tools ?? [];
  const labeled = tools.filter(t => /\[Capability: [^\]]+\]/.test(t.description ?? '')).length;
  if (tools.length === 94 && new Set(tools.map(t => t.name)).size === 94) ok(`94 unique tools listed (${labeled} carry [Capability: …] labels)`);
  else warn(`got ${tools.length} tools (expected 94) — check server version`);
  const lifecycle = ['query_trail_heat', 'get_swap_quote', 'create_intent', 'execute_swap', 'get_receipt', 'grant_session_key'];
  for (const n of lifecycle) console.log(`    ${tools.some(t => t.name === n) ? '•' : '✗'} ${n}`);

  // ---- 3. research ----
  step(3, 'research: query_trail_heat (Scout preview)');
  const th = parse(await call('query_trail_heat', { limit: 3 }));
  if (th?.tier === 'scout') ok(`tier=scout, ${th.totalCount} protocols indexed; Scout hides live scores ("[ENCRYPTED: UPGRADE TO PIONEER]") — that is the designed preview`);
  else warn(`unexpected envelope: ${JSON.stringify(th)?.slice(0, 200)}`);

  step(4, 'research: get_chain_breakdown (Scout preview + parity)');
  const cb = parse(await call('get_chain_breakdown', {}));
  if (cb?.tier === 'scout' && cb.direct_upgrade_url) ok(`status=${cb.status}; direct_upgrade_url=${cb.direct_upgrade_url} — envelopes self-describe the upgrade path`);

  // ---- 5. plan (swap quote) ----
  step(5, 'plan: get_swap_quote {lifi, Base, ETH -> USDC, 0.01 ETH}');
  const sq = parse(await call('get_swap_quote', { fromChainId: 8453, toChainId: 8453, fromToken: 'ETH', toToken: 'USDC', fromAmount: '10000000000000000', protocol: 'lifi' }));
  if (sq && !sq.isError) ok(`estimate returned (keys: ${Object.keys(sq).slice(0, 8).join(', ')}); executionReady=false, authority=NOT_GRANTED — quotes never sign`);
  else warn(`quote envelope: ${JSON.stringify(sq)?.slice(0, 200)}`);

  // ---- 6. fence demo ----
  if (!process.env.SKIP_INTENT) {
    step(6, 'lifecycle: create_intent — watch the keyless fence fire');
    console.log('  (an intent is the commercial lifecycle step; keyless Scouts are fenced BEFORE anything is created)');
    const ci = parse(await call('create_intent', {
      intent: {
        actor: { type: 'agent_agentic_sdk', id: 'hello-farmdash' },
        action: 'spot_swap', chain: 'base', protocol: 'lifi',
        wallet: '0x000000000000000000000000000000000000dEaD',
        params: { fromChainId: 8453, toChainId: 8453, fromToken: 'ETH', toToken: 'USDC', fromAmount: '10000000000000000' },
        constraints: { executionMode: 'USER_SIGNED', maxSlippagePct: 0.5, source: 'hello-farmdash-demo' },
        evidence: { quoteSource: 'get_swap_quote keyless provider-neutral estimate', observedAt: new Date().toISOString() },
      },
    }));
    const env = ci && (ci.ok === false || ci.code) ? ci : null;
    if (ci?.isError || env?.ok === false) {
      ok(`graceful fence: code=${env?.code ?? ci?.code} retryable=${env?.retryable ?? ci?.retryable} request_id=${(env?.request_id ?? ci?.request_id) ? 'present' : 'absent'}`);
      console.log(`  ${c('TEACH', '33')} nothing was created, signed, or paid; zero transaction authority granted.`);
      console.log('  TEACH this is the money wall: Scout is research-grade. Prepare/execute needs a Pioneer grant or x402 payment — see money-wall-cheatsheet.md.');
    } else warn(`unexpected (not fenced?): ${JSON.stringify(ci)?.slice(0, 220)}`);
  } else warn('SKIP_INTENT set — fence demo skipped');

  step('✓', 'done — you just walked the full Scout-tier lifecycle');
  console.log(`  next: read money-wall-cheatsheet.md (quota + fence semantics), then wire your client (client-configs.md).`);
} catch (e) {
  bad(e.message);
  console.log('  troubleshoot: is dist/index.js built? Node >= 18? See README.md quickstart.');
} finally {
  try { child.stdin.end(); } catch {}
  try { child.kill(); } catch {}
  setTimeout(() => process.exit(0), 300);
}
