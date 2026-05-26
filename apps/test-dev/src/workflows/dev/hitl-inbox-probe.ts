import { workflow } from "@codemation/host";
import type { RunnableNodeConfig } from "@codemation/core";
import { Callback, inboxApproval } from "@codemation/core-nodes";

type InvoiceItem = { invoiceId: string; vendor: string; amount: number };
type DecidedItem = InvoiceItem & {
  decision: {
    status: "approved" | "rejected" | "timed-out" | "auto-accepted";
    actor?: { email?: string; displayName?: string };
    decidedAt?: Date;
    note?: string;
  };
};

/**
 * Dev probe for the HITL local inbox flow.
 *
 * Flow:
 *   manualTrigger -> inboxApproval (suspends) -> Callback (logs decision)
 *
 * To test:
 *   1. Open /workflows, find "HITL Inbox Probe", click "Run"
 *   2. The run suspends. Open /dev/inbox — one row appears.
 *   3. Click Approve or Reject.
 *   4. On Approve: the Callback logs "HITL_PROBE_DECIDED" with the merged decision.
 *   5. On Reject: the run halts with status="halted", reason="hitl-rejected".
 *      (No Callback fires, by design — story 03 first-class halt semantics.)
 */
export default workflow("wf.hitl-inbox-probe")
  .name("HITL Inbox Probe")
  .manualTrigger("Start", [{ invoiceId: "INV-001", vendor: "Acme Corp", amount: 250 }])
  .then(
    inboxApproval.create(
      {
        title: "Approve invoice from ${item.json.vendor}",
        body: "Invoice ${item.json.invoiceId} for €${item.json.amount}",
        priority: "normal",
        timeout: "1h",
        onTimeout: "halt",
      },
      "Approve invoice",
    ) as unknown as RunnableNodeConfig<InvoiceItem, DecidedItem>,
  )
  .then(
    new Callback("Log decision", (items) => {
      for (const item of items) {
        // eslint-disable-next-line no-console
        console.log("HITL_PROBE_DECIDED:", JSON.stringify(item.json, null, 2));
      }
      return items;
    }),
  )
  .build();
