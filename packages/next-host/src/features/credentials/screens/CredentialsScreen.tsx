"use client";

import { Button } from "@/components/ui/button";

import { CredentialConfirmDialog } from "../components/CredentialConfirmDialog";
import { CredentialDialog } from "../components/CredentialDialog";
import { CredentialsScreenInstancesTable } from "../components/CredentialsScreenInstancesTable";
import { CredentialsScreenTestFailureAlert } from "../components/CredentialsScreenTestFailureAlert";
import { useCredentialsScreen } from "../hooks/useCredentialsScreen";

export function CredentialsScreen() {
  const {
    credentialInstances,
    credentialTypes,
    typesLoading,
    typesError,
    typesEmpty,
    showTestFailureAlert,
    testResult,
    activeTestInstanceId,
    openCreateDialog,
    openEditDialog,
    testCredentialInstance,
    deleteConfirmTarget,
    closeDeleteCredentialConfirm,
    executeConfirmedDeleteCredential,
    oauthDisconnectConfirmOpen,
    setOauthDisconnectConfirmOpen,
    executeOAuthDisconnect,
    isDialogOpen,
    dialogMode,
    editingInstanceId,
    selectedTypeId,
    setSelectedTypeId,
    displayName,
    setDisplayName,
    editDisplayName,
    setEditDisplayName,
    sourceKind,
    setSourceKind,
    publicFieldValues,
    setPublicFieldValues,
    secretFieldValues,
    setSecretFieldValues,
    envRefValues,
    setEnvRefValues,
    editPublicFieldValues,
    setEditPublicFieldValues,
    editSecretFieldValues,
    setEditSecretFieldValues,
    editEnvRefValues,
    setEditEnvRefValues,
    showSecrets,
    setShowSecrets,
    oauth2RedirectUri,
    isLoadingOauth2RedirectUri,
    credentialWithSecretsQuery,
    editingInstance,
    errorMessage,
    dialogTestResult,
    isSubmitting,
    isEditSubmitting,
    isDialogTesting,
    createCredentialInstance,
    updateCredentialInstance,
    testCredentialFromDialog,
    connectOAuth2Credential,
    openOAuthDisconnectConfirm,
    closeDialog,
    setTestResult,
    openDeleteCredentialConfirm,
  } = useCredentialsScreen();

  return (
    <div data-testid="credentials-screen" className="flex flex-col gap-6">
      {showTestFailureAlert && (
        <CredentialsScreenTestFailureAlert message={testResult?.message} onDismiss={() => setTestResult(null)} />
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="m-0 max-w-2xl text-sm text-muted-foreground">
          Create credential instances, store secrets safely, and verify health before binding them to workflow slots.
        </p>
        <Button
          type="button"
          onClick={openCreateDialog}
          disabled={typesLoading || typesEmpty}
          data-testid="credential-add-button"
        >
          Add credential
        </Button>
      </div>

      {credentialInstances.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="credentials-empty"
        >
          No credential instances yet. Click &quot;Add credential&quot; to create one.
        </div>
      ) : (
        <CredentialsScreenInstancesTable
          credentialInstances={credentialInstances}
          testResult={testResult}
          activeTestInstanceId={activeTestInstanceId}
          onOpenEdit={openEditDialog}
          onTest={testCredentialInstance}
          onOpenDelete={openDeleteCredentialConfirm}
        />
      )}

      {deleteConfirmTarget && (
        <CredentialConfirmDialog
          title="Delete credential?"
          testId="credential-delete-confirm-dialog"
          cancelTestId="credential-delete-confirm-cancel"
          confirmTestId="credential-delete-confirm-delete"
          confirmLabel="Delete"
          confirmVariant="danger"
          onCancel={closeDeleteCredentialConfirm}
          onConfirm={() => void executeConfirmedDeleteCredential()}
        >
          <p className="m-0 text-sm text-muted-foreground">
            This will permanently remove <strong>{deleteConfirmTarget.displayName}</strong>. This cannot be undone.
          </p>
        </CredentialConfirmDialog>
      )}

      {oauthDisconnectConfirmOpen && (
        <CredentialConfirmDialog
          title="Disconnect OAuth2?"
          testId="credential-oauth-disconnect-confirm-dialog"
          cancelTestId="credential-oauth-disconnect-confirm-cancel"
          confirmTestId="credential-oauth-disconnect-confirm-confirm"
          confirmLabel="Disconnect"
          confirmVariant="primary"
          onCancel={() => setOauthDisconnectConfirmOpen(false)}
          onConfirm={() => void executeOAuthDisconnect()}
        >
          <p className="m-0 text-sm text-muted-foreground">
            This will remove the OAuth connection for this credential. You can reconnect later.
          </p>
        </CredentialConfirmDialog>
      )}

      {isDialogOpen && (
        <CredentialDialog
          key={editingInstanceId ?? "create"}
          mode={dialogMode!}
          credentialTypes={credentialTypes}
          typesLoading={typesLoading}
          typesError={typesError}
          typesEmpty={typesEmpty}
          selectedTypeId={selectedTypeId}
          setSelectedTypeId={setSelectedTypeId}
          displayName={dialogMode === "create" ? displayName : editDisplayName}
          setDisplayName={dialogMode === "create" ? setDisplayName : setEditDisplayName}
          sourceKind={sourceKind}
          setSourceKind={setSourceKind}
          publicFieldValues={dialogMode === "create" ? publicFieldValues : editPublicFieldValues}
          setPublicFieldValues={dialogMode === "create" ? setPublicFieldValues : setEditPublicFieldValues}
          secretFieldValues={dialogMode === "create" ? secretFieldValues : editSecretFieldValues}
          setSecretFieldValues={dialogMode === "create" ? setSecretFieldValues : setEditSecretFieldValues}
          envRefValues={dialogMode === "create" ? envRefValues : editEnvRefValues}
          setEnvRefValues={dialogMode === "create" ? setEnvRefValues : setEditEnvRefValues}
          showSecrets={showSecrets}
          setShowSecrets={setShowSecrets}
          oauth2RedirectUri={oauth2RedirectUri}
          isLoadingOauth2RedirectUri={isLoadingOauth2RedirectUri}
          secretsLoading={credentialWithSecretsQuery.isLoading}
          editingInstance={editingInstance}
          errorMessage={errorMessage}
          dialogTestResult={dialogTestResult}
          isSubmitting={dialogMode === "create" ? isSubmitting : isEditSubmitting}
          isDialogTesting={isDialogTesting}
          onCreate={createCredentialInstance}
          onUpdate={updateCredentialInstance}
          onTest={testCredentialFromDialog}
          onConnectOAuth2={connectOAuth2Credential}
          onDisconnectOAuth2={openOAuthDisconnectConfirm}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
