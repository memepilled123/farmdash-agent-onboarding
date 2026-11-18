# Money-wall cheat sheet — FarmDash fence order & quota semantics

Verified live 2026-11-17 (keyless Scout runs). This is the contract an integrating agent must script against — including the parts the official manuals still get wrong.

## The lifecycle and where the walls are

```
research (free)          plan (free)            fence ──── paid tier ──── prepare → sign (local) → execute → receipt
query_trail_heat         get_swap_quote         create_intent             execute_swap / execute_perp_order
get_chain_breakdown      analyze_futures_*      (402 payment_required)    get_receipt
wallet/portfolio reads   simulate_*                                       …
```

- Research and **provider-neutral quotes are free** (the quote route `/api/agents/quote` is outside the `/api/v1` meter).
- The **commercial fence sits at intent creation**: keyless `create_intent` returns HTTP-mapped **402 `payment_required`** (~0.02–0.03 USDC on tested routes), `retryable: true`, with `request_id`, zero authority granted, and nothing persisted.
- **Nothing before the wall signs, pays, or grants authority.** Quotes are estimates (`executionReady: false`); policy verdicts (`pass/review/halt`) gate everything downstream.

## The 402 envelope — what an agent should do with it

```jsonc
{
  "ok": false, "code": "payment_required", "retryable": true,
  "request_id": "…", "rate_limit": {"limit": 0, "remaining": 0},
  "commercial_options": [ /* grants each carry grants_transaction_authority: false */ ],
  "execution_options": {"USER_SIGNED": {"operational": true, "farmdash_custody": false}, "BOUNDED_AUTONOMOUS": {"operational": true}}
}
```

Agent rules:
1. `payment_required` is **not an error to retry blindly** — it's the upgrade boundary. Surface `commercial_options` / `direct_upgrade_url` to the human; do not loop.
2. `retryable: true` refers to *paid* retries (x402 `PAYMENT-SIGNATURE` header flow), not free retries.
3. `USER_SIGNED` remains the default execution mode even after payment; BOUNDED_AUTONOMOUS additionally requires a verified owner grant + live readiness — payment alone bypasses nothing.

## Quota budgeting (Scout, keyless)

- **30 requests / 24 h / IP**, reset 00:00 UTC (`X-RateLimit-Reset`).
- Metered: `/api/v1/*` tool calls (trail-heat, chain-breakdown, status, onboard, intents…).
- **Not metered:** `.well-known/mcp.json`, `/agents/openapi.yaml`, docs pages, the quote route, and `GET /api/v1/trail-heat?mock=true` (sandbox returns no rate-limit headers at all — free for demos).
- **Trap #1 — 402 responses omit `X-RateLimit-Limit/Remaining`** (only `Reset` is sent) even though the CORS policy promises them on all responses. Budget by reading headers on the *next metered call*, or probe:
  `GET /api/v1/agent/trail-heat-query?limit=1` → read `X-RateLimit-Remaining` (costs 1 call).
- **Trap #2 — stdio MCP hides headers entirely** (the server does not forward them). MCP-only agents should probe quota over REST before long tool runs, or reserve a margin.
- **Fence-order caveat:** the skill manuals (`farmdash-signal-architect`, `farmdash-futures-strategist`) still document a **401 `execution_trial_identity_required`** sign-retry flow on quote/analyze routes. The intent path now fences at **402** first. Don't hard-code either: on first contact with a fence route, log the actual `code` + `status` and branch on `retryable` + the retry headers, not on folklore. (Authored 2026-11-17; if FarmDash aligns the docs, trust the docs.)

## Hard rules that keep agents out of trouble

- Providers are `lifi` / `relay` **only** (schema-enforced; 0x paused, OKX quarantined — no workaround exists or should).
- Never send private keys/seed phrases — no FarmDash tool accepts them; every signing flow returns a payload for the **user's local wallet**.
- Respect policy verdicts: `halt` stops execution; `review` requires human confirmation; `pass` ≠ audit/simulation (Camp Guard states `simulation.status: "not_run"` honestly).
- Bounded autonomy defaults: max 1 action/cycle, allowlists, cooldowns, `analysis_only` fallback. A paid tier never waives authority checks.
