export type WorkflowDetailChromeState = Readonly<{
  isLiveWorkflowView: boolean;
  workflowIsActive: boolean;
  isWorkflowActivationPending: boolean;
  setWorkflowActive: (active: boolean) => void;
  workflowActivationAlertLines: ReadonlyArray<string> | null;
  dismissWorkflowActivationAlert: () => void;
  credentialAttentionSummaryLines: ReadonlyArray<string>;
}>;
