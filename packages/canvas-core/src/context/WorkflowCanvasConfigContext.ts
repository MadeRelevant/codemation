"use client";

import { createContext, useContext } from "react";

import type { WorkflowCanvasConfig } from "../types/WorkflowCanvasConfig";

const WorkflowCanvasConfigContext = createContext<WorkflowCanvasConfig | undefined>(undefined);

export const WorkflowCanvasConfigProvider = WorkflowCanvasConfigContext.Provider;

export function useWorkflowCanvasConfig(): WorkflowCanvasConfig | undefined {
  return useContext(WorkflowCanvasConfigContext);
}
