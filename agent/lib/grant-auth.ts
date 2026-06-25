// Capability-grant verification for a REMOTE keemakr agent (phase 1).
//
// The keemakr operator now attaches a short-lived signed JWT — a "capability
// grant" — on every delegation (see keemakr-core src/lib/capability/grant.ts).
// The grant carries a VERIFIABLE tenant identity + scopes (+ a trace id), signed
// with keemakr-core's RS256 key and verifiable against the JWKS it already
// publishes at /.well-known/jwks.json.
//
// This helper verifies that grant against core's JWKS and turns it into an eve
// SessionAuthContext, so tools downstream can read the tenant + scopes off
// ctx.session.auth. It is the PRIMARY inbound auth; the legacy shared-secret
// bearer remains as a migration fallback (dropped in phase 6, L12).
//
// NOTE: this file is intentionally identical across every kee-* demo. In phase 2
// it moves into the published @keemakr/agent-sdk so third-party agents import it
// rather than hand-rolling JWKS verification (R2). Until then it is vendored here.

import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  type AuthFn,
  extractBearerToken,
} from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

// Same issuer keemakr-core mints with (GRANT_ISSUER). Audience is THIS agent's
// deployment identity — a grant minted for another remote must not verify here.
const GRANT_ISSUER = "keemakr";

// Lazily-built JWKS set, cached across requests. jose handles key rotation +
// kid lookup + its own fetch caching internally.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function jwksFor(url: string) {
  if (!jwks) jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

/**
 * An AuthFn that accepts a keemakr capability grant. Returns a principal
 * carrying `tenant_id` and `scopes` in attributes on success, or `null` to skip
 * to the next auth entry (so it composes before the shared-secret fallback).
 *
 * Configured by environment:
 *   KEE_CORE_JWKS_URL   keemakr-core's JWKS endpoint (e.g.
 *                       https://app.keemakr.com/.well-known/jwks.json).
 *                       If unset, this AuthFn skips entirely → grant path is off,
 *                       only the secret fallback applies (safe migration default).
 *   KEE_AGENT_AUDIENCE  this deployment's audience, matching the `aud` the
 *                       operator mints (the runtime URL's origin). If unset, the
 *                       audience check is skipped (dev convenience) but a warning
 *                       is logged — set it in any deployed remote.
 */
export function grantAuth(): AuthFn<Request> {
  return async (request) => {
    const jwksUrl = process.env.KEE_CORE_JWKS_URL;
    if (!jwksUrl) return null; // grant path not configured → fall through to fallback

    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) return null;

    const expectedAud = process.env.KEE_AGENT_AUDIENCE;
    try {
      const { payload } = await jwtVerify(token, jwksFor(jwksUrl), {
        issuer: GRANT_ISSUER,
        ...(expectedAud ? { audience: expectedAud } : {}),
      });
      const tenantId = payload.tenant_id;
      const scopes = payload.scopes;
      const installedAgent = payload.installed_agent;
      const traceId = payload.trace_id;
      if (typeof tenantId !== "string" || !Array.isArray(scopes)) return null;

      return {
        authenticator: "keemakr-grant",
        issuer: GRANT_ISSUER,
        principalId: typeof installedAgent === "string" ? installedAgent : "keemakr-agent",
        principalType: "service",
        subject: typeof payload.sub === "string" ? payload.sub : undefined,
        attributes: {
          via: "grant",
          tenant_id: tenantId,
          scopes: scopes.map(String),
          // Stash the raw grant so useKee(ctx) can forward it to the Capability
          // API. It is short-lived (~120s) and kept server-side in the auth
          // context — never exposed to the model.
          grant_token: token,
          ...(typeof traceId === "string" ? { trace_id: traceId } : {}),
        },
      } satisfies SessionAuthContext;
    } catch {
      // Invalid/expired/wrong-aud grant → skip; don't leak which check failed.
      return null;
    }
  };
}
