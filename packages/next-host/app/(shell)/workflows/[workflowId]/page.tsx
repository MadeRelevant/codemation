import { Suspense } from "react";

import { WorkflowDetailScreen } from "../../../../src/features/workflows/screens/WorkflowDetailScreen";

export default async function WorkflowDetailPage(args: Readonly<{ params: Promise<{ workflowId: string }> }>) {
  const params = await args.params;
  return (
    <Suspense
      fallback={
        <div
          data-testid="workflow-detail-suspense-fallback"
          className="h-full w-full min-h-0 bg-muted/40 p-4 text-sm text-muted-foreground"
        />
      }
    >
      <WorkflowDetailScreen workflowId={params.workflowId} />
    </Suspense>
  );
}
