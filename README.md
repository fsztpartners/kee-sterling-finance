# kee-sterling-finance

A focused [eve](https://github.com/vercel-labs/eve) agent, packaged as a
**keemakr Marketplace** entry. It does one thing: take an account's billing
snapshot and **assess churn / failed-payment risk** — returning a risk level, a
recommended action, and a ready-to-send dunning draft.

It exists to be a small but real end-to-end example of a Marketplace entry — small
enough to read in a minute, but complete enough to exercise the platform's full
`register → resolve-dependencies → install` round-trip.

## What's here

| Path | What it is |
| --- | --- |
| `agent/agent.ts` | The single eve root agent (cheap model; just calls `assess_account`). |
| `agent/instructions.md` | How the agent behaves — assess account risk only, nothing else. |
| `agent/tools/assess_account.ts` | The one tool: a pure, deterministic billing-snapshot → risk transform. |
| `agent/channels/eve.ts` | The HTTP entrypoint (dev-login / OIDC). Root-only in eve. |
| `agent/sandbox.ts` | Pinned to `just-bash` — no real shell, no network. |
| `entry.json` | The Marketplace submission (the `EntrySubmission` the platform ingests). |

## The Marketplace entry

`entry.json` is the metadata the keemakr platform's `registerEntry()` reads. It
declares:

- a **department** `finance` with two **agents** (`monitor` Revenue Monitor and
  `recovery` Payment Recovery),
- one **required connection** dependency: **Stripe** (`provider: "stripe"`).

The required connection is what makes this more than a stub: when a tenant installs
the entry, the platform resolves dependencies against that tenant. Until they
connect Stripe, the install sits in **`pending_deps`** (department + agents seeded
but disabled); once connected, a reconcile flips it to **`installed`**. The risk
transform itself does **not** call Stripe — in a real deployment the operator
hydrates each account's billing snapshot from Stripe and feeds it to the tool.

To make it install immediately instead, set `dependencies` to `[]` in `entry.json`.

## Develop

```bash
nvm use            # Node >= 24
npm install
npm run dev:eve    # run the eve agent locally
npm run typecheck  # tsc --noEmit
npm run lint
```

Ask it: *"assess this account: $1,200 MRR, 21 days overdue, 3 failed charges on Pro"*
→ a `critical` risk level, a recommended escalation, and a drafted dunning email.

## Capability grant (tenant identity from keemakr)

When the keemakr operator delegates to this agent, it attaches a short-lived
**capability grant** — a signed JWT carrying the verified tenant id and the scopes
the install was granted. This repo verifies that grant against keemakr-core's
published JWKS in [`agent/channels/eve.ts`](agent/channels/eve.ts) via the
`grantAuth()` helper in [`agent/lib/grant-auth.ts`](agent/lib/grant-auth.ts), which
surfaces the tenant + scopes on the session auth context.

The grant is **primary** auth, ahead of the legacy shared secret (which now rides
in its own `x-keemakr-secret` header during the migration window).

Configure it with environment variables on the deployed agent:

| Variable | Purpose |
| --- | --- |
| `KEE_CORE_JWKS_URL` | keemakr-core's JWKS endpoint, e.g. `https://app.keemakr.com/.well-known/jwks.json`. If unset, the grant path is off and only dev-login / OIDC / the shared secret apply. |
| `KEE_AGENT_AUDIENCE` | This deployment's audience — its public origin — matching the `aud` the operator mints. |
| `KEE_STERLING_FINANCE_INBOUND_SECRET` | Optional legacy shared secret (fallback only; being retired). |

> The `grant-auth.ts` helper is the same one published as
> [`@keemakr/agent-sdk`](https://www.npmjs.com/package/@keemakr/agent-sdk)
> (`import { grantAuth } from "@keemakr/agent-sdk"`). It is vendored here for now
> and will be replaced by the package import.
