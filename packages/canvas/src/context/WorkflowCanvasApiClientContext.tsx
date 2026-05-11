"use client";

import { createContext, useContext } from "react";
import type { WorkflowCanvasApiClient } from "../types/WorkflowCanvasApiClient";

const WorkflowCanvasApiClientContext = createContext<WorkflowCanvasApiClient | null>(null);

export const WorkflowCanvasApiClientProvider = WorkflowCanvasApiClientContext.Provider;

export function useWorkflowCanvasApiClient(): WorkflowCanvasApiClient {
  const client = useContext(WorkflowCanvasApiClientContext);
  if (!client) throw new Error("WorkflowCanvasApiClient not provided");
  return client;
}
