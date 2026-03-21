"use client";

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
    <div data-testid="credentials-screen" className="credentials-screen">
      {showTestFailureAlert && (
        <CredentialsScreenTestFailureAlert message={testResult?.message} onDismiss={() => setTestResult(null)} />
      )}
      <div className="credentials-screen__header">
        <p className="credentials-screen__description">
          Create credential instances, store secrets safely, and verify health before binding them to workflow slots.
        </p>
        <button
          type="button"
          className="credentials-screen__add-btn"
          onClick={openCreateDialog}
          disabled={typesLoading || typesEmpty}
          data-testid="credential-add-button"
        >
          Add credential
        </button>
      </div>

      {credentialInstances.length === 0 ? (
        <div className="credentials-empty" data-testid="credentials-empty">
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
          titleElementId="credential-delete-confirm-title"
          testId="credential-delete-confirm-dialog"
          cancelTestId="credential-delete-confirm-cancel"
          confirmTestId="credential-delete-confirm-delete"
          confirmLabel="Delete"
          confirmVariant="danger"
          onCancel={closeDeleteCredentialConfirm}
          onConfirm={() => void executeConfirmedDeleteCredential()}
        >
          <p className="credential-dialog__help" style={{ margin: 0 }}>
            This will permanently remove <strong>{deleteConfirmTarget.displayName}</strong>. This cannot be undone.
          </p>
        </CredentialConfirmDialog>
      )}

      {oauthDisconnectConfirmOpen && (
        <CredentialConfirmDialog
          title="Disconnect OAuth2?"
          titleElementId="credential-oauth-disconnect-confirm-title"
          testId="credential-oauth-disconnect-confirm-dialog"
          cancelTestId="credential-oauth-disconnect-confirm-cancel"
          confirmTestId="credential-oauth-disconnect-confirm-confirm"
          confirmLabel="Disconnect"
          confirmVariant="primary"
          onCancel={() => setOauthDisconnectConfirmOpen(false)}
          onConfirm={() => void executeOAuthDisconnect()}
        >
          <p className="credential-dialog__help" style={{ margin: 0 }}>
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
