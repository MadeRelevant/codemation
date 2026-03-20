import { HostedWorkflowDetailPage } from "../../../../src/ui/HostedWorkflowDetailPage";

export default async function WorkflowDetailPage(args: Readonly<{ params: Promise<{ workflowId: string }> }>) {
  const params = await args.params;
  return <HostedWorkflowDetailPage workflowId={params.workflowId} />;
}
