import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { WorkflowDetailScreen } from "../../../../src/features/workflows/screens/WorkflowDetailScreen";
import { workflowDetailPageAccessResolver } from "../../../../src/features/workflows/server/WorkflowDetailPageAccessResolverComposition";

export default async function WorkflowDetailPage(args: Readonly<{ params: Promise<{ workflowId: string }> }>) {
  const params = await args.params;
  const requestHeaders = await headers();
  const access = await workflowDetailPageAccessResolver.resolve({
    workflowId: params.workflowId,
    cookieHeader: requestHeaders.get("cookie"),
  });
  if (access === "not-found") {
    notFound();
  }
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
