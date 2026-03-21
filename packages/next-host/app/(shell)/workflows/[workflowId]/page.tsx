import { WorkflowDetailScreen } from "../../../../src/features/workflows/screens/WorkflowDetailScreen";

export default async function WorkflowDetailPage(args: Readonly<{ params: Promise<{ workflowId: string }> }>) {
  const params = await args.params;
  return <WorkflowDetailScreen workflowId={params.workflowId} />;
}
