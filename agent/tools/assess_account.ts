import { defineTool } from "eve/tools";
import { z } from "zod";

// The one tool. A pure, deterministic account-risk assessment.
//
// No tenant, no database, no network — given a snapshot of an account's billing
// health (MRR, overdue days, failed charges, plan) it computes a risk level, a
// recommended action, and a ready-to-send dunning draft. The required Stripe
// connection (declared in entry.json) gates INSTALL at the platform layer; it is
// intentionally NOT called here, so the agent stays trivially readable while
// still exercising the marketplace dependency round-trip. In a real deployment
// the operator would hydrate these inputs from Stripe charges / subscriptions /
// failures and feed them to this tool.

// Risk scoring: a deterministic weighted score → bucket. Higher = worse.
//   - overdue days dominate (recoverability falls off fast after ~30 days)
//   - each failed charge compounds the signal
//   - MRR is a value weight: a high-value account at the same risk warrants a
//     more urgent action than a small one.
type RiskLevel = "low" | "watch" | "high" | "critical";

export default defineTool({
  description:
    "Assesses an account's churn / payment-failure risk from its billing snapshot (MRR, overdue days, failed charges, plan) and returns a deterministic risk_level, recommended_action, and a ready-to-send dunning_draft. Use this for any 'is this account at risk', 'should we worry about churn', 'assess billing health', or 'draft a dunning email' style request.",
  inputSchema: z.object({
    mrr: z
      .number()
      .min(0)
      .describe("Monthly recurring revenue for the account, in dollars."),
    days_overdue: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("How many days the account's current invoice is past due."),
    failed_charges: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Number of failed charge attempts in the current cycle."),
    plan: z
      .string()
      .max(80)
      .optional()
      .describe("The account's plan name, if known (for the dunning draft)."),
  }),
  execute: async (input) => {
    const overdue = input.days_overdue ?? 0;
    const failed = input.failed_charges ?? 0;

    // Deterministic weighted score.
    const overdueScore = overdue * 2; // overdue days dominate
    const failedScore = failed * 15; // each failure is a strong signal
    const mrrWeight = input.mrr >= 1000 ? 20 : input.mrr >= 250 ? 10 : 0;
    const score = overdueScore + failedScore + mrrWeight;

    let risk_level: RiskLevel;
    if (score >= 90) risk_level = "critical";
    else if (score >= 50) risk_level = "high";
    else if (score >= 20) risk_level = "watch";
    else risk_level = "low";

    const recommended_action: Record<RiskLevel, string> = {
      low: "No action needed — account is healthy. Continue normal monitoring.",
      watch:
        "Send a friendly payment reminder and monitor for the next billing cycle.",
      high: "Start the dunning sequence now and have a CSM reach out personally.",
      critical:
        "Escalate immediately: pause downgrade, call the account owner, and send the recovery offer before the subscription cancels.",
    };

    const planLine = input.plan ? ` on the ${input.plan} plan` : "";
    const overdueLine =
      overdue > 0
        ? `Your latest invoice is ${overdue} day${overdue === 1 ? "" : "s"} past due`
        : "We had trouble processing your most recent payment";
    const failedLine =
      failed > 0
        ? ` after ${failed} failed charge attempt${failed === 1 ? "" : "s"}`
        : "";

    const dunning_draft =
      `Subject: Action needed to keep your subscription active\n\n` +
      `Hi there,\n\n` +
      `${overdueLine}${failedLine}${planLine}. To avoid any interruption to your ` +
      `service, please update your payment method at your earliest convenience.\n\n` +
      `If you've already taken care of this, thank you — no further action is needed. ` +
      `Otherwise, just reply to this email and we'll be glad to help.\n\n` +
      `Thanks,\nThe Sterling Finance team`;

    return { risk_level, score, recommended_action: recommended_action[risk_level], dunning_draft };
  },
});
