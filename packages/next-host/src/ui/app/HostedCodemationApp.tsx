import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Providers } from "../providers/Providers";
import { CredentialsScreen } from "../screens/CredentialsScreen";
import { HostedWorkflowDetailRoute } from "./HostedWorkflowDetailRoute";
import { HostedWorkflowsScreen } from "../screens/HostedWorkflowsScreen";
import { UsersScreen } from "../screens/UsersScreen";

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
          <Route path="/credentials" element={<CredentialsScreen />} />
          <Route path="/users" element={<UsersScreen />} />
          <Route path="/workflows" element={<HostedWorkflowsScreen />} />
          <Route path="/workflows/:workflowId" element={<HostedWorkflowDetailRoute />} />
          <Route path="*" element={<Navigate to="/workflows" replace />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  );
}
