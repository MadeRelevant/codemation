import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { WorkflowDetailScreenPage } from "../../../../src/features/workflows/screens/WorkflowDetailScreenPage";
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
      <WorkflowDetailScreenPage workflowId={params.workflowId} />
    </Suspense>
  );
}
