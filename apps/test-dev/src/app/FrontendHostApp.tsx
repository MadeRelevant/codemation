import { HostedWorkflowDetailScreen, HostedWorkflowsScreen, Providers } from "@codemation/frontend/client";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";

export function FrontendHostApp() {
  return (
    <Providers websocketPort={import.meta.env.VITE_CODEMATION_WS_PORT ?? "3001"}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/workflows" replace />} />
          <Route path="/workflows" element={<HostedWorkflowsScreen />} />
          <Route path="/workflows/:workflowId" element={<WorkflowDetailRoute />} />
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  );
}

function WorkflowDetailRoute() {
  const params = useParams();
  if (!params.workflowId) {
    return <Navigate to="/workflows" replace />;
  }
  return <HostedWorkflowDetailScreen workflowId={params.workflowId} />;
}

function NotFoundRoute() {
  return <Navigate to="/workflows" replace />;
}
