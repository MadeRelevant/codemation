import { useCallback, useState } from "react";

import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";

import { codemationApiClient } from "../../../api/CodemationApiClient";
import { CodemationApiHttpError } from "../../../api/CodemationApiHttpError";
import type { CredentialInstanceDto } from "../../workflows/hooks/realtime/realtime";
import { parseCredentialInstanceTestPayload } from "../lib/credentialInstanceTestPayloadParser";
import { useCredentialDialogSession } from "./useCredentialDialogSession";

/**
 * Credentials page: list/table actions plus dialog orchestration via {@link useCredentialDialogSession}.
 */
export function useCredentialsScreen() {
  const {
    credentialInstances,
    credentialTypesAll,
    credentialFieldEnvStatus,
    credentialTypesQuery,
    credentialWithSecretsQuery,
    editingInstance,
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
    errorMessage,
    setErrorMessage,
    dialogTestResult,
    isSubmitting,
    isEditSubmitting,
    isDialogTesting,
    createCredentialInstance,
    updateCredentialInstance,
    testCredentialFromDialog,
    connectOAuth2Credential,
    closeDialog,
    openCreateDialog: openCreateDialogSession,
    openEditDialog,
    refreshQueries,
    oauthDisconnectConfirmOpen,
    setOauthDisconnectConfirmOpen,
    executeOAuthDisconnect,
  } = useCredentialDialogSession({
    closeAfterCreatePolicy: "always",
    oauthConnectedPolicy: "refresh_only",
    buildDialogProps: false,
  });

  const [activeTestInstanceId, setActiveTestInstanceId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ instanceId: string; status: string; message?: string } | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<CredentialInstanceDto | null>(null);

  const openCreateDialog = useCallback(() => {
    openCreateDialogSession();
  }, [openCreateDialogSession]);

  const testCredentialInstance = useCallback(
    async (instance: CredentialInstanceDto): Promise<void> => {
      try {
        setActiveTestInstanceId(instance.instanceId);
        setTestResult(null);
        setErrorMessage(null);
        const data = await codemationApiClient.postJson<{ status?: string; message?: string }>(
          ApiPaths.credentialInstanceTest(instance.instanceId),
        );
        setTestResult({
          instanceId: instance.instanceId,
          status: data?.status ?? "healthy",
          message: data?.message,
        });
        await refreshQueries();
      } catch (error) {
        if (error instanceof CodemationApiHttpError) {
          const parsed = parseCredentialInstanceTestPayload(error.bodyText);
          setTestResult({
            instanceId: instance.instanceId,
            status: "failing",
            message: parsed.message ?? "Test failed",
          });
          return;
        }
        setTestResult({
          instanceId: instance.instanceId,
          status: "failing",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setActiveTestInstanceId(null);
      }
    },
    [refreshQueries, setErrorMessage],
  );

  const openDeleteCredentialConfirm = (instance: CredentialInstanceDto): void => {
    setDeleteConfirmTarget(instance);
  };

  const closeDeleteCredentialConfirm = (): void => {
    setDeleteConfirmTarget(null);
  };

  const executeConfirmedDeleteCredential = async (): Promise<void> => {
    if (!deleteConfirmTarget) {
      return;
    }
    const instanceId = deleteConfirmTarget.instanceId;
    try {
      setErrorMessage(null);
      await codemationApiClient.delete(ApiPaths.credentialInstance(instanceId));
      closeDeleteCredentialConfirm();
      if (editingInstanceId === instanceId) closeDialog();
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const openOAuthDisconnectConfirm = (): void => {
    setOauthDisconnectConfirmOpen(true);
  };

  const typesLoading = credentialTypesQuery.isLoading;
  const typesError = credentialTypesQuery.isError;
  const typesEmpty = credentialTypesAll.length === 0;

  const isDialogOpen = dialogMode !== null;
  const showTestFailureAlert = testResult?.status === "failing";

  return {
    credentialInstances,
    credentialTypes: credentialTypesAll,
    credentialFieldEnvStatus,
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
  };
}
