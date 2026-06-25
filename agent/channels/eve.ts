import { localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { grantAuth } from "@keemakr/agent-sdk";

// The single HTTP entrypoint. Channels are root-only in eve and therefore live
// here.
//
// This agent is a REMOTE agent: the keemakr operator (a separate deployment)
// delegates to it over HTTP. The receiving side must authorize that caller. We
// accept callers in this order:
//   1. localDev()    — loopback dev calls (eve dev on localhost).
//   2. vercelOidc()  — Vercel deployment-to-deployment trust (prod).
//   3. grantAuth()   — a keemakr capability grant (short-lived signed JWT)
//      verified against keemakr-core's published JWKS. Carries the tenant id +
//      scopes (+ trace id), which tools read off ctx.session.auth. Enabled by
//      setting KEE_CORE_JWKS_URL. This is the ONLY cross-deployment auth — the
//      legacy shared-secret bearer was retired (phase 6).
export default eveChannel({
  auth: [localDev(), vercelOidc(), grantAuth()],
});
