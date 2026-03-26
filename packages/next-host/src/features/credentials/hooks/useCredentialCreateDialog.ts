import type { CredentialInstanceDto } from "../../workflows/hooks/realtime/realtime";
import { useCredentialDialogSession } from "./useCredentialDialogSession";

/**
 * Create / edit credential dialog for embedding outside the Credentials page (e.g. workflow node properties).
 * Delegates to {@link useCredentialDialogSession} with canvas-specific policies.
 */
export function useCredentialCreateDialog(
  args: Readonly<{
    workflowId: string;
    onCreated?: (instance: CredentialInstanceDto) => void;
  }>,
) {
  const { workflowId, onCreated } = args;
  const session = useCredentialDialogSession({
    workflowId,
    onCredentialCreated: onCreated,
    closeAfterCreatePolicy: "unless_oauth2",
    oauthConnectedPolicy: "close_dialog",
    buildDialogProps: true,
  });

  return {
    isDialogOpen: session.dialogMode !== null,
    dialogProps: session.dialogProps,
    openCreateDialog: session.openCreateDialog,
    openEditDialog: session.openEditDialog,
    closeDialog: session.closeDialog,
    oauthDisconnectConfirmOpen: session.oauthDisconnectConfirmOpen,
    executeOAuthDisconnect: session.executeOAuthDisconnect,
    cancelOAuthDisconnect: session.cancelOAuthDisconnect,
  };
}
