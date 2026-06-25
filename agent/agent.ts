import { defineAgent } from "eve";
import { anthropic } from "@ai-sdk/anthropic";

// kee-sterling-finance — a small revenue-monitoring eve agent.
//
// eve allows exactly ONE root agent per project (agent/agent.ts). This is it:
// a single agent with one tool (`assess_account`) that performs a deterministic
// risk assessment — given an account's MRR, overdue days, and failed charges it
// returns a risk level, a recommended action, and a drafted dunning message.
// There are no subagents, no database. It exists to be a focused keemakr
// Marketplace entry: small enough to read in a minute, but complete enough to
// exercise the full register → resolve-dependencies → install round-trip (it
// declares one required connection, Stripe — see entry.json).
//
// Model routing mirrors the platform convention: the Vercel AI Gateway string in
// production (needs AI_GATEWAY_API_KEY), the direct Anthropic provider in local
// dev. The model just decides to call `assess_account` and relays the result, so
// it's the cheap tier.
export default defineAgent({
  model: process.env.AI_GATEWAY_API_KEY
    ? "anthropic/claude-haiku-4.5"
    : anthropic("claude-haiku-4-5-20251001"),
});
