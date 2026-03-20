import { Navigate, useParams } from "react-router-dom";

import { HostedWorkflowDetailScreen } from "../screens/HostedWorkflowDetailScreen";

export function HostedWorkflowDetailRoute() {
  const params = useParams();
  if (!params.workflowId) {
    return <Navigate to="/workflows" replace />;
  }
  return <HostedWorkflowDetailScreen workflowId={params.workflowId} />;
}
