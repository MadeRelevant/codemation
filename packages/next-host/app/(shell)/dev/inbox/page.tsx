import { resolveHumanTaskStore } from "../../../../src/server/devInboxComposition";
import { DevInboxTable } from "./DevInboxTable";

export default async function DevInboxPage() {
  const store = await resolveHumanTaskStore();
  const pending = await store.findAllPending();

  return (
    <main className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dev inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">Pending HITL tasks. Local mode — single-user, no ACL.</p>
      </div>
      <DevInboxTable tasks={[...pending]} />
    </main>
  );
}
