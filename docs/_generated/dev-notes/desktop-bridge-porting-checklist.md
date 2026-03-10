# Legacy Bridge Porting — Final Checklist (100%)

## Scope
Finish full parity of the integrated plugin bridge (no separate bridge plugin) with production quality.

## Rules
- Work on branch: `feat/desktop-bridge-porting-finalize`
- Do not commit yet. Keep all changes in working tree for technical review.
- Quality gate: zero `any`, explicit input validation, typed errors, deterministic tests.

## Phase 0 — Baseline (mandatory)
- [ ] Pull latest branch and run baseline validation:
  - `npm --prefix apps/figma-plugin run typecheck`
  - `npm --prefix apps/figma-plugin run test`
  - `npm --prefix apps/figma-plugin run build`
- [ ] Record baseline outputs in PR notes draft (local file), including versions and timestamps.

## Phase 1 — Method Parity Matrix (bridge original -> our plugin)
- [ ] Read the original legacy bridge source and extract exact method contract per method:
  - request shape
  - response shape
  - error codes/messages
  - side effects/events
- [ ] Create parity matrix table in `docs/_generated/dev-notes/mcp-api-contract.md`:
  - columns: `method`, `original`, `ours`, `status`, `diff`, `action`
- [ ] Label methods by priority:
  - P0: already done, verify parity
  - P1: required for 100% target
  - P2: optional/deferred
- [ ] Exit criteria: no unknown methods, no undocumented divergence.

## Phase 2 — Implement Missing Methods (P1)
- [ ] For each `status = missing` or `status = divergent`, implement handler in `apps/figma-plugin/src/bridge/handlers/*`.
- [ ] Route method in `apps/figma-plugin/src/bridge/dispatcher.ts`.
- [ ] Add strict validation for params:
  - reject unknown/invalid payloads with typed bridge errors
  - no silent coercion
- [ ] Ensure every method returns deterministic payload shape.
- [ ] Exit criteria: all P1 methods marked `done` in parity matrix.

## Phase 3 — Handshake and Capabilities Hardening
- [ ] Verify handshake flow end-to-end:
  - `start -> connect -> request file info -> broadcast FILE_INFO -> connected`
- [ ] Ensure capabilities are explicit and stable:
  - list tools from MCP
  - preserve diagnosis codes (`mismatch`, `fallback`, `not_connected`, `timeout`)
- [ ] Ensure no real MCP error is converted into fake success/empty state.
- [ ] Exit criteria: explicit cause is always available in disconnected/mismatch paths.

## Phase 4 — Runtime Robustness and Concurrency
- [ ] Confirm singleton behavior for runtime and no duplicate listeners/timers.
- [ ] Protect against stale async updates (generation guard where needed).
- [ ] Validate stop/cleanup sequence:
  - pending requests rejected
  - listener removed
  - sockets closed
- [ ] Validate reconnect behavior after:
  - MCP restart
  - port switch
  - temporary disconnect
- [ ] Exit criteria: no leaked timers/listeners, no stale state overwrite.

## Phase 5 — Test Matrix (mandatory)

### Unit tests
- [ ] Protocol/type guards (success/error envelopes, malformed payloads).
- [ ] Dispatcher routing and unknown method behavior.
- [ ] Each handler:
  - success path
  - validation error path
  - Figma API failure path

### Integration tests (bridge runtime)
- [ ] request/response correlation with requestId
- [ ] handshake success + handshake timeout
- [ ] runtime stop cleanup
- [ ] WS disconnect/reconnect behavior

### Route/API tests (dashboard)
- [ ] capabilities endpoint with real diagnosis propagation
- [ ] hot-port switch: success, rollback, concurrent 409
- [ ] surgical routes: fallback only for capability-missing, not timeout/disconnect

### Regression tests
- [ ] ensure no previous bug reappears:
  - stale status/capabilities in UI
  - misleading configured port in error path
  - false `truncated` flags

- [ ] Exit criteria: all suites green in CI-equivalent commands.

## Phase 6 — Manual E2E in Figma Desktop
- [ ] Open plugin and verify non-blank UI render.
- [ ] Confirm bridge status shows transition to `Connected`.
- [ ] Switch ports: `9223 -> 9224 -> 9225`, verify status and real connected port.
- [ ] Disconnect MCP and verify user-facing cause is clear and actionable.
- [ ] Reconnect MCP and verify automatic recovery.
- [ ] Change file/page/selection and verify bridge events still flow.
- [ ] Exit criteria: stable behavior for 10+ minutes without manual resets.

## Phase 7 — Docs and Operational Clarity
- [ ] Update plugin README with new architecture:
  - integrated bridge model
  - required local endpoints
  - troubleshooting quick guide
- [ ] Update `mcp-api-contract.md` with final payloads and error codes.
- [ ] Add “known limitations” section (if any) with explicit impact.

## Final Quality Gate (before requesting review)
- [ ] `npm --prefix apps/figma-plugin run typecheck`
- [ ] `npm --prefix apps/figma-plugin run test`
- [ ] `npm --prefix apps/figma-plugin run build`
- [ ] relevant server/tooling tests for touched code
- [ ] `git diff --stat` reviewed and scoped
- [ ] No commits created yet

## Review Package to deliver
- [ ] Parity matrix completed with all P1 `done`
- [ ] Test evidence (commands + results)
- [ ] E2E evidence (steps + observed state transitions)
- [ ] List of known risks (if any) with mitigation
