import {
  type AuthFn,
  extractBearerToken,
  localDev,
  vercelOidc,
} from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { grantAuth } from "../lib/grant-auth";

// The single HTTP entrypoint. Channels are root-only in eve and therefore live
// here.
//
// This agent is a REMOTE agent: the keemakr operator (a separate deployment)
// delegates to it over HTTP. The receiving side must authorize that caller. We
// accept callers in this order:
//   1. localDev()    — loopback dev calls (eve dev on localhost).
//   2. vercelOidc()  — Vercel deployment-to-deployment trust (prod demo).
//   3. grantAuth()   — PRIMARY: a keemakr capability grant (short-lived signed
//      JWT) verified against keemakr-core's published JWKS. Carries the tenant
//      id + scopes (+ trace id), which tools read off ctx.session.auth. See
//      agent/lib/grant-auth.ts. Enabled by setting KEE_CORE_JWKS_URL.
//   4. bearerSecret() — FALLBACK: the legacy shared-secret bearer, now read from
//      a SEPARATE header (x-keemakr-secret) so it never collides with the grant
//      in `authorization`. Kept only for the migration window; dropped in phase 6
//      (L12). The operator attaches the grant in `authorization` and the secret
//      (when set) in `x-keemakr-secret`.
//
// Set KEE_STERLING_FINANCE_INBOUND_SECRET in the environment to enable the bearer fallback.
// If it is unset, bearerSecret() skips (returns null) and only the grant +
// localDev/vercelOidc apply — so the shared-secret surface only exists when you
// opt in.
function bearerSecret(): AuthFn<Request> {
  return (request) => {
    const expected = process.env.KEE_STERLING_FINANCE_INBOUND_SECRET;
    if (!expected) return null; // not configured → skip to next entry
    // The secret now rides in its own header, never `authorization` (which the
    // grant owns). extractBearerToken is reused only to strip an optional
    // "Bearer " prefix; a bare secret value is also accepted.
    const raw = request.headers.get("x-keemakr-secret");
    const token = extractBearerToken(raw) ?? raw;
    if (!token || token !== expected) return null; // not our caller → skip
    return {
      attributes: { via: "shared-secret" },
      authenticator: "bearer-secret",
      principalId: "keemakr-operator",
      principalType: "service",
    };
  };
}

export default eveChannel({
  auth: [localDev(), vercelOidc(), grantAuth(), bearerSecret()],
});
