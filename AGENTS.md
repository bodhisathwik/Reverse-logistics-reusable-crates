<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All app API calls go through `gatewayCall` (src/lib/gateway.functions.ts) → `dispatch` in src/lib/gateway.server.ts; it enforces roles from `ENDPOINTS` in src/lib/domain.ts and logs to gateway_log. Why: the gateway is the single audited entry point.
- Each simulated service only touches its own table prefix (crate_asset_*, custody_*, balance_*); balances change only by consuming event_bus rows. Why: demonstrates separate persistence.
- Filter event_bus by offset with `.eq('"offset"', v)` (quoted); bare `offset` is a reserved PostgREST pagination param.
- Pure business rules live in src/lib/domain.ts and are covered by src/test/domain.test.ts.
- Scanned codes are parsed only by `normalizeScan`/`uniqueCrateIds` in domain.ts (labels encode CRATE-<id> / CUSTODY-<id>); a scanned return sends crate_ids and returnedQty = unique count.
- Signup onboarding is DB-driven: trigger `handle_new_user` creates profiles + a least-privilege customerDepot role; deliveryAgent is granted only by server fn `redeemAgentCode` (src/lib/auth.functions.ts) checking `agent_access_codes`. Why: clients can never write user_roles.
- UI role/depot come from user_roles via `useAuth` (src/hooks/use-auth.tsx), never JWT/localStorage. Why: role table is the source of truth.
