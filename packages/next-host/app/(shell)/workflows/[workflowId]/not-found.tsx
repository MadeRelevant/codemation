export default function WorkflowDetailNotFoundPage() {
  return (
    <main className="flex h-full min-h-0 w-full items-center justify-center bg-muted/40 p-6">
      <div
        data-testid="workflow-detail-not-found"
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm"
      >
        <h1 className="text-lg font-semibold text-foreground">Workflow not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The workflow you requested does not exist or is no longer available.
        </p>
      </div>
    </main>
  );
}
