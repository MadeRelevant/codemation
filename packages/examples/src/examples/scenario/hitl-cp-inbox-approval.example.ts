/**
 * @description Invoice approval workflow with human-in-the-loop sign-off.
 *              Polls Gmail for new invoices, extracts the amount, and asks
 *              a reviewer to approve in the inbox before posting to accounting.
 *              Auto-detects: routes to CP inbox in managed mode, local /dev/inbox
 *              in non-managed mode. Same workflow file works in both environments.
 * @tags hitl, approval, gmail, finance, audit, inbox, style:scenario
 * @uses @codemation/core-nodes, @codemation/core-nodes-gmail, node:inboxApproval, node:OnNewGmailTrigger, node:HttpRequest
 * @dependencies @codemation/core-nodes@workspace:*, @codemation/core-nodes-gmail@workspace:*
 */

import { createWorkflowBuilder, inboxApproval, MapData, HttpRequest } from "@codemation/core-nodes";
import { OnNewGmailTrigger } from "@codemation/core-nodes-gmail";
import type { OnNewGmailTriggerItemJson } from "@codemation/core-nodes-gmail";

// ---------------------------------------------------------------------------
// Input shape produced by the Gmail trigger + map step
// ---------------------------------------------------------------------------

type InvoiceItem = Readonly<{
  messageId: string;
  vendor: string;
  amount: number;
  currency: string;
}>;

// Shape after the inboxApproval node merges its decision into the item.
type InvoiceItemWithDecision = InvoiceItem & {
  readonly decision: {
    readonly status: "approved" | "rejected" | "timed-out" | "auto-accepted";
    readonly actor?: { readonly email: string };
    readonly decidedAt?: Date;
    readonly note?: string;
  };
};

// ---------------------------------------------------------------------------
// Inline helper — parses vendor/amount/currency from a Gmail message body.
// In production, replace with a dedicated parser or LLM extraction step.
// ---------------------------------------------------------------------------

function parseInvoiceFromEmail(json: OnNewGmailTriggerItemJson): {
  vendor: string;
  amount: number;
  currency: string;
} {
  // Minimal heuristic: look for "From: <name>" in the body for vendor,
  // and a pattern like "€ 1,234.56" or "$1234" for amount/currency.
  const body = json.textPlain ?? json.snippet ?? "";
  const vendorMatch = /From:\s*([^\n<]+)/.exec(body) ?? /^([A-Z][A-Za-z\s]+) Invoice/.exec(body);
  const amountMatch = /([€$£])?\s*([\d,]+(?:\.\d{1,2})?)/.exec(body);
  const currencySymbolMap: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP" };
  return {
    vendor: vendorMatch ? vendorMatch[1].trim() : (json.from ?? "Unknown vendor"),
    amount: amountMatch ? parseFloat(amountMatch[2].replace(/,/g, "")) : 0,
    currency: amountMatch?.[1] ? (currencySymbolMap[amountMatch[1]] ?? "EUR") : "EUR",
  };
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export const workflow = createWorkflowBuilder({
  id: "example.hitl-invoice-approval",
  name: "Invoice approval with HITL",
})
  // Gmail trigger: poll the "invoices" label for new messages.
  // The "auth" credential slot must be connected to a Gmail OAuth credential.
  .trigger(
    new OnNewGmailTrigger("New invoice email", {
      mailbox: "me",
      labelIds: ["invoices"],
    }),
  )
  // Step 1: Extract structured invoice data from the email body.
  .then(
    new MapData<OnNewGmailTriggerItemJson, InvoiceItem>("Extract invoice data", (item) => {
      const parsed = parseInvoiceFromEmail(item.json);
      return {
        messageId: item.json.messageId,
        vendor: parsed.vendor,
        amount: parsed.amount,
        currency: parsed.currency,
      };
    }),
  )
  // Step 2: Suspend for human approval.
  //   inboxApproval auto-routes to the CP inbox in managed mode and to
  //   local /dev/inbox in non-managed mode — no channel config needed.
  //   The workflow resumes when the reviewer approves or rejects.
  //   title/body are callbacks that read the item at runtime.
  .humanApproval(inboxApproval, {
    title: ({ item }) => `Approve invoice from ${(item.json as InvoiceItem).vendor}`,
    body: ({ item }) => {
      const invoice = item.json as InvoiceItem;
      return `Amount: ${invoice.amount} ${invoice.currency}\nMessage ID: ${invoice.messageId}`;
    },
    priority: "normal",
    timeout: "24h",
    onTimeout: "halt",
  })
  // Step 3: Post to accounting only after approval.
  //   item.json.decision carries { status, actor, decidedAt, note }.
  //   Rejected runs never reach this node (the engine discards them at the HITL node).
  .then(
    new HttpRequest<InvoiceItemWithDecision>("Post to accounting", {
      method: "POST",
      url: "https://accounting.example.com/api/invoices",
      body: {
        kind: "json",
        data: JSON.stringify({
          vendor: "${item.json.vendor}",
          amount: "${item.json.amount}",
          currency: "${item.json.currency}",
          approvedBy: "${item.json.decision.actor.email}",
          approvedAt: "${item.json.decision.decidedAt}",
          note: "${item.json.decision.note}",
        }),
      },
    }),
  )
  .build();

// sampleInput is exported for the CP indexer's "try this example" affordance.
// The workflow uses a Gmail trigger; sampleInput is provided for documentation only.
export const sampleInput = {
  messageId: "msg-001",
  vendor: "Acme Corp",
  amount: 1250.0,
  currency: "EUR",
};

export default workflow;
