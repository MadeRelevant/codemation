import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Providers } from "../providers/Providers";
import { HostedWorkflowDetailScreen } from "../screens/HostedWorkflowDetailScreen";
import { HostedWorkflowsScreen } from "../screens/HostedWorkflowsScreen";

export interface HostedCodemationAppProps {
  readonly basename?: string;
  readonly websocketPort?: string;
}

export function HostedCodemationApp(args: HostedCodemationAppProps) {
  const { basename, websocketPort = "3001" } = args;
  return (
    <Providers websocketPort={websocketPort}>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/" element={<Navigate to="/workflows" replace />} />
          <Route path="/workflows" element={<HostedWorkflowsScreen />} />
          <Route path="/workflows/:workflowId" element={<HostedWorkflowDetailRoute />} />
          <Route path="*" element={<Navigate to="/workflows" replace />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  );
}

function HostedWorkflowDetailRoute() {
  const params = useParams();
  if (!params.workflowId) {
    return <Navigate to="/workflows" replace />;
  }
  return <HostedWorkflowDetailScreen workflowId={params.workflowId} />;
}
