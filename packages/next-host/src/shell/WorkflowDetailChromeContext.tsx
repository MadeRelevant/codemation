"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type WorkflowDetailChromeState = Readonly<{
  isLiveWorkflowView: boolean;
  workflowIsActive: boolean;
  isWorkflowActivationPending: boolean;
  setWorkflowActive: (active: boolean) => void;
  workflowActivationAlertLines: ReadonlyArray<string> | null;
  dismissWorkflowActivationAlert: () => void;
  credentialAttentionSummaryLines: ReadonlyArray<string>;
}>;

type WorkflowDetailChromeContextValue = Readonly<{
  chrome: WorkflowDetailChromeState | null;
  setChrome: Dispatch<SetStateAction<WorkflowDetailChromeState | null>>;
}>;

const WorkflowDetailChromeContext = createContext<WorkflowDetailChromeContextValue | null>(null);

export function WorkflowDetailChromeProvider(args: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const [chrome, setChrome] = useState<WorkflowDetailChromeState | null>(null);
  const value = useMemo(() => ({ chrome, setChrome }), [chrome]);
  return <WorkflowDetailChromeContext.Provider value={value}>{args.children}</WorkflowDetailChromeContext.Provider>;
}

export function useWorkflowDetailChrome(): WorkflowDetailChromeState | null {
  return useContext(WorkflowDetailChromeContext)?.chrome ?? null;
}

export function useWorkflowDetailChromeDispatch(): Dispatch<SetStateAction<WorkflowDetailChromeState | null>> | null {
  return useContext(WorkflowDetailChromeContext)?.setChrome ?? null;
}
