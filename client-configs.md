# Verified MCP client configs for FarmDash

All configs assume the server is built once:

```bash
git clone https://github.com/Parmasanandgarlic/farmdash-openclaw-skills
cd farmdash-openclaw-skills/mcp-server && npm ci && npm run build
```

`SERVER_JS` below = the absolute path to `farmdash-openclaw-skills/mcp-server/dist/index.js`. The server makes **zero network calls at startup** — a wrong path fails immediately, a right path starts silently (~3.5 s Node+SDK boot).

## Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json` (Windows) / `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "farmdash": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\farmdash-openclaw-skills\\mcp-server\\dist\\index.js"]
    }
  }
}
```

## Cursor

`~/.cursor/mcp.json` (same shape):

```json
{
  "mcpServers": {
    "farmdash": {
      "command": "node",
      "args": ["/absolute/path/to/farmdash-openclaw-skills/mcp-server/dist/index.js"]
    }
  }
}
```

## Cline

`cline_mcp_settings.json` — identical `mcpServers` shape as Claude Desktop.

## OpenClaw / any skills-path agent

Two-part install:

1. **Skills:** copy any of the 10 skill folders (`farmdash-trail-intelligence`, `farmdash-camp-guard`, …) from the repo into your agent's skills path. Each is self-contained (`SKILL.md` + `SKILL.json` with per-tool schemas).
2. **MCP server:** register the same `node …/dist/index.js` stdio command in your agent's MCP connector settings (in AutoClaw: Settings → Skills & connectors → MCP server → stdio command).

## Generic stdio client (the 3-line handshake)

FarmDash speaks newline-delimited JSON-RPC 2.0 on stdin/stdout:

```jsonc
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"you","version":"0.1.0"}}}
// -> result.serverInfo == {"name":"farmdash-agent-os","version":"5.0.0"}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
// -> result.tools.length == 94, every description prefixed [Capability: …]
```

`hello-farmdash.mjs` in this kit is a complete working reference implementation.

## Environment variables (all optional)

| Var | Effect |
|---|---|
| *(none)* | **Scout tier, keyless** — 30 req/24h/IP |
| `FARMDASH_API_KEY` | Pioneer/Syndicate bearer (paid) |
| `FARMDASH_MCP_PROFILE` | presentation filter (`full` default) — never authorization |
| `FARMDASH_BASE_URL` | default `https://www.farmdash.one/api` |
| `FARMDASH_INSTALLATION_ID` | override the local analytics UUID |

**Heads-up:** over stdio, HTTP headers (including `X-RateLimit-Remaining`) are *not* forwarded to your client. Budget via a REST probe instead — pattern in money-wall-cheatsheet.md.
