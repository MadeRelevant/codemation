import { resolveHumanTaskStore } from "../../../../src/server/devInboxComposition";
import { DevInboxTable } from "./DevInboxTable";

export default async function DevInboxPage() {
  const store = await resolveHumanTaskStore();
  const pending = await store.findAllPending();

  return (
    <main className="p-6 space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Workflows pause here when they reach an <code className="text-xs font-mono">inboxApproval</code> step. Approve
          or reject a task to let the run continue. This is the local dev surface for human-in-the-loop — in production
          or managed mode your inbox lives in the control plane instead.
        </p>
        <p className="text-sm text-muted-foreground">
          Inbox approval is the only built-in HITL channel right now. Slack, Teams, email, and WhatsApp channels are on
          the roadmap — until they ship, route all HITL steps through{" "}
          <code className="text-xs font-mono">inboxApproval</code> and review them here.
        </p>
      </div>
      <DevInboxTable tasks={[...pending]} />
    </main>
  );
}
