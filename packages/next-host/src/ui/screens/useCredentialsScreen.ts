import { ApiPaths } from "@codemation/frontend-src/presentation/http/ApiPaths";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useCredentialInstancesQuery,
  useCredentialInstanceWithSecretsQuery,
  useCredentialTypesQuery,
  type CredentialInstanceDto,
} from "../realtime/realtime";
import {
  buildEmptySecretFieldValues,
  buildFieldStringValues,
} from "./credentialFieldHelpers";
import type { FormSourceKind } from "./credentialFormTypes";

type DialogMode = "create" | "edit" | null;

export function useCredentialsScreen() {
  const queryClient = useQueryClient();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const credentialTypesQuery = useCredentialTypesQuery();
  const credentialInstancesQuery = useCredentialInstancesQuery();
  const credentialWithSecretsQuery = useCredentialInstanceWithSecretsQuery(
    dialogMode === "edit" ? editingInstanceId : null,
  );
  const credentialTypes = credentialTypesQuery.data ?? [];
  const credentialInstances = credentialInstancesQuery.data ?? [];
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [sourceKind, setSourceKind] = useState<FormSourceKind>("db");
  const [publicFieldValues, setPublicFieldValues] = useState<Record<string, string>>({});
  const [secretFieldValues, setSecretFieldValues] = useState<Record<string, string>>({});
  const [envRefValues, setEnvRefValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTestInstanceId, setActiveTestInstanceId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ instanceId: string; status: string; message?: string } | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPublicFieldValues, setEditPublicFieldValues] = useState<Record<string, string>>({});
  const [editSecretFieldValues, setEditSecretFieldValues] = useState<Record<string, string>>({});
  const [editEnvRefValues, setEditEnvRefValues] = useState<Record<string, string>>({});
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [oauth2RedirectUri, setOauth2RedirectUri] = useState<string>("");
  const [isLoadingOauth2RedirectUri, setIsLoadingOauth2RedirectUri] = useState(false);
  const [dialogTestResult, setDialogTestResult] = useState<{ status: string; message?: string } | null>(null);
  const [isDialogTesting, setIsDialogTesting] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<CredentialInstanceDto | null>(null);
  const [oauthDisconnectConfirmOpen, setOauthDisconnectConfirmOpen] = useState(false);

  const selectedType = useMemo(
    () => credentialTypes.find((type) => type.typeId === selectedTypeId),
    [credentialTypes, selectedTypeId],
  );
  const secretFields = selectedType?.secretFields ?? [];
  const editingInstance = useMemo(
    () => (editingInstanceId ? credentialInstances.find((i) => i.instanceId === editingInstanceId) : null),
    [credentialInstances, editingInstanceId],
  );
  const editingType = useMemo(
    () => credentialTypes.find((t) => t.typeId === editingInstance?.typeId),
    [credentialTypes, editingInstance?.typeId],
  );

  const resetCreateForm = useCallback(() => {
    setPublicFieldValues(selectedType ? buildFieldStringValues(selectedType.publicFields ?? []) : {});
    setSecretFieldValues(selectedType ? buildEmptySecretFieldValues(selectedType.secretFields ?? []) : {});
    setEnvRefValues(selectedType ? buildEmptySecretFieldValues(selectedType.secretFields ?? []) : {});
  }, [selectedType]);

  useEffect(() => {
    resetCreateForm();
  }, [selectedTypeId, sourceKind, resetCreateForm]);

  const refreshQueries = useCallback(async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["credential-instances"] }),
      queryClient.invalidateQueries({ queryKey: ["credential-types"] }),
      queryClient.invalidateQueries({ queryKey: ["credential-instance-with-secrets"] }),
    ]);
  }, [queryClient]);

  const openCreateDialog = useCallback(() => {
    setDialogMode("create");
    setSelectedTypeId("");
    setDisplayName("");
    setSourceKind("db");
    setPublicFieldValues({});
    setSecretFieldValues({});
    setEnvRefValues({});
    setErrorMessage(null);
    setDialogTestResult(null);
    setShowSecrets(false);
  }, []);

  const closeDialog = useCallback(() => {
    setOauthDisconnectConfirmOpen(false);
    setDialogMode(null);
    setEditingInstanceId(null);
    setShowSecrets(false);
    setOauth2RedirectUri("");
    setErrorMessage(null);
    setDialogTestResult(null);
  }, []);

  useEffect(() => {
    const activeType = dialogMode === "edit" ? editingType : selectedType;
    if (activeType?.auth?.kind !== "oauth2") {
      setOauth2RedirectUri("");
      return;
    }
    let cancelled = false;
    const loadRedirectUri = async (): Promise<void> => {
      try {
        setIsLoadingOauth2RedirectUri(true);
        const response = await fetch(ApiPaths.oauth2RedirectUri(), { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = (await response.json()) as { redirectUri?: string };
        if (!cancelled) {
          setOauth2RedirectUri(data.redirectUri ?? "");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingOauth2RedirectUri(false);
        }
      }
    };
    void loadRedirectUri();
    return () => {
      cancelled = true;
    };
  }, [dialogMode, editingType, selectedType]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      if (typeof window === "undefined" || event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as Readonly<{
        kind?: string;
        instanceId?: string;
        connectedEmail?: string;
        message?: string;
      }>;
      if (data.kind === "oauth2.connected") {
        void refreshQueries();
        setErrorMessage(null);
        return;
      }
      if (data.kind === "oauth2.error") {
        setErrorMessage(data.message ?? "OAuth2 connection failed.");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [refreshQueries]);

  const ensureDialogCredentialInstance = useCallback(async (): Promise<CredentialInstanceDto | null> => {
    if (dialogMode === "edit") {
      return editingInstance ?? null;
    }
    if (!selectedType) {
      return null;
    }
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setDialogTestResult(null);
      const secretConfig =
        sourceKind === "db"
          ? (Object.fromEntries(
              secretFields.map((f) => [f.key, secretFieldValues[f.key] ?? ""]),
            ) as Record<string, unknown>)
          : undefined;
      const envSecretRefs =
        sourceKind === "env"
          ? (Object.fromEntries(
              secretFields
                .map((f) => [f.key, (envRefValues[f.key] ?? "").trim()] as const)
                .filter(([, v]) => v.length > 0),
            ) as Record<string, string>)
          : undefined;
      const publicConfig = Object.fromEntries(
        (selectedType.publicFields ?? []).map((field) => [field.key, (publicFieldValues[field.key] ?? "").trim()]),
      ) as Record<string, unknown>;
      const response = await fetch(ApiPaths.credentialInstances(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          typeId: selectedTypeId,
          displayName: displayName.trim(),
          sourceKind,
          publicConfig,
          secretConfig,
          envSecretRefs,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const created = (await response.json()) as CredentialInstanceDto;
      const createdType = credentialTypes.find((type) => type.typeId === created.typeId);
      setDialogMode("edit");
      setEditingInstanceId(created.instanceId);
      setSelectedTypeId(created.typeId);
      setEditDisplayName(created.displayName);
      setEditPublicFieldValues(buildFieldStringValues(createdType?.publicFields ?? [], created.publicConfig));
      if (created.sourceKind === "db") {
        setEditSecretFieldValues({ ...secretFieldValues });
        setEditEnvRefValues(buildEmptySecretFieldValues(createdType?.secretFields ?? []));
      } else {
        setEditSecretFieldValues(buildEmptySecretFieldValues(createdType?.secretFields ?? []));
        setEditEnvRefValues({ ...envRefValues });
      }
      await refreshQueries();
      return created;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    credentialTypes,
    dialogMode,
    editingInstance,
    envRefValues,
    publicFieldValues,
    refreshQueries,
    secretFieldValues,
    secretFields,
    selectedType,
    selectedTypeId,
    sourceKind,
  ]);

  const createCredentialInstance = async (): Promise<void> => {
    const created = await ensureDialogCredentialInstance();
    if (!created) {
      return;
    }
    closeDialog();
  };

  const updateCredentialInstance = async (): Promise<void> => {
    if (!editingInstanceId || !editingType || !editingInstance) return;
    const fetchedWithSecrets = credentialWithSecretsQuery.data;
    try {
      setIsEditSubmitting(true);
      setErrorMessage(null);
      const secretFieldsEdit = editingType.secretFields ?? [];
      const isDb = editingInstance.sourceKind === "db";
      const secretConfig = isDb
        ? (Object.fromEntries(
            secretFieldsEdit.map((f) => {
              const edited = (editSecretFieldValues[f.key] ?? "").trim();
              const existing = fetchedWithSecrets?.secretConfig?.[f.key] ?? "";
              return [f.key, edited.length > 0 ? edited : existing];
            }),
          ) as Record<string, unknown>)
        : undefined;
      const envSecretRefs =
        !isDb && editingInstance.sourceKind === "env"
          ? (Object.fromEntries(
              secretFieldsEdit
                .map((f) => {
                  const edited = (editEnvRefValues[f.key] ?? "").trim();
                  const existing = fetchedWithSecrets?.envSecretRefs?.[f.key] ?? "";
                  return [f.key, edited.length > 0 ? edited : existing] as const;
                })
                .filter(([, v]) => v.length > 0),
            ) as Record<string, string>)
          : undefined;
      const hasSecretUpdates =
        (isDb && secretConfig && Object.values(secretConfig).some((v) => String(v).length > 0)) ||
        (envSecretRefs && Object.keys(envSecretRefs).length > 0);
      const updateBody: {
        displayName: string;
        publicConfig: Record<string, unknown>;
        secretConfig?: Record<string, unknown>;
        envSecretRefs?: Record<string, string>;
      } = {
        publicConfig: Object.fromEntries(
          (editingType.publicFields ?? []).map((field) => [field.key, (editPublicFieldValues[field.key] ?? "").trim()]),
        ),
        displayName: editDisplayName.trim(),
      };
      if (hasSecretUpdates) {
        if (isDb && secretConfig) updateBody.secretConfig = secretConfig;
        if (envSecretRefs) updateBody.envSecretRefs = envSecretRefs;
      }
      const response = await fetch(ApiPaths.credentialInstance(editingInstanceId), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updateBody),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      closeDialog();
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const connectOAuth2Credential = async (): Promise<void> => {
    if (typeof window === "undefined") {
      return;
    }
    const targetInstance = await ensureDialogCredentialInstance();
    if (!targetInstance) {
      return;
    }
    setErrorMessage(null);
    const popup = window.open(
      ApiPaths.oauth2Auth(targetInstance.instanceId),
      `codemation-oauth2-${targetInstance.instanceId}`,
      "popup=yes,width=640,height=760",
    );
    if (!popup) {
      setErrorMessage("The OAuth popup was blocked by the browser.");
    }
  };

  const openOAuthDisconnectConfirm = (): void => {
    setOauthDisconnectConfirmOpen(true);
  };

  const executeOAuthDisconnect = async (): Promise<void> => {
    if (!editingInstanceId) {
      setOauthDisconnectConfirmOpen(false);
      return;
    }
    const instanceId = editingInstanceId;
    try {
      setOauthDisconnectConfirmOpen(false);
      setErrorMessage(null);
      const response = await fetch(ApiPaths.oauth2Disconnect(instanceId), {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const testCredentialFromDialog = async (): Promise<void> => {
    const targetInstance = await ensureDialogCredentialInstance();
    if (!targetInstance) {
      return;
    }
    try {
      setIsDialogTesting(true);
      setDialogTestResult(null);
      setErrorMessage(null);
      const response = await fetch(ApiPaths.credentialInstanceTest(targetInstance.instanceId), {
        method: "POST",
      });
      const text = await response.text();
      let data: { status?: string; message?: string } = {};
      try {
        data = text ? (JSON.parse(text) as { status?: string; message?: string }) : {};
      } catch {
        data = { message: text || "Test failed" };
      }
      if (!response.ok) {
        setDialogTestResult({
          status: "failing",
          message: data?.message ?? "Test failed",
        });
        return;
      }
      setDialogTestResult({
        status: data?.status ?? "healthy",
        message: data?.message,
      });
      await refreshQueries();
    } catch (error) {
      setDialogTestResult({
        status: "failing",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDialogTesting(false);
    }
  };

  const testCredentialInstance = async (instance: CredentialInstanceDto): Promise<void> => {
    try {
      setActiveTestInstanceId(instance.instanceId);
      setTestResult(null);
      setErrorMessage(null);
      const response = await fetch(ApiPaths.credentialInstanceTest(instance.instanceId), {
        method: "POST",
      });
      const text = await response.text();
      let data: { status?: string; message?: string } = {};
      try {
        data = text ? (JSON.parse(text) as { status?: string; message?: string }) : {};
      } catch {
        data = { message: text || "Test failed" };
      }
      if (!response.ok) {
        setTestResult({
          instanceId: instance.instanceId,
          status: "failing",
          message: data?.message ?? "Test failed",
        });
        return;
      }
      setTestResult({
        instanceId: instance.instanceId,
        status: data?.status ?? "healthy",
        message: data?.message,
      });
      await refreshQueries();
    } catch (error) {
      setTestResult({
        instanceId: instance.instanceId,
        status: "failing",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setActiveTestInstanceId(null);
    }
  };

  const openEditDialog = (instance: CredentialInstanceDto): void => {
    const instanceType = credentialTypes.find((type) => type.typeId === instance.typeId);
    setDialogMode("edit");
    setEditingInstanceId(instance.instanceId);
    setSelectedTypeId(instance.typeId);
    setEditDisplayName(instance.displayName);
    setEditPublicFieldValues(buildFieldStringValues(instanceType?.publicFields ?? [], instance.publicConfig));
    setEditSecretFieldValues({});
    setEditEnvRefValues({});
    setShowSecrets(false);
    setErrorMessage(null);
    setDialogTestResult(null);
  };

  useEffect(() => {
    const data = credentialWithSecretsQuery.data;
    if (!data || editingInstanceId !== data.instanceId || dialogMode !== "edit") return;
    const type = credentialTypes.find((t) => t.typeId === data.typeId);
    const fields = type?.secretFields ?? [];
    setEditPublicFieldValues(buildFieldStringValues(type?.publicFields ?? [], data.publicConfig));
    if (data.sourceKind === "db" && data.secretConfig) {
      const values = Object.fromEntries(
        fields.map((f) => [f.key, data.secretConfig![f.key] ?? ""]),
      );
      setEditSecretFieldValues(values);
      setEditEnvRefValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
    } else if (data.sourceKind === "env" && data.envSecretRefs) {
      setEditSecretFieldValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
      const envValues = Object.fromEntries(
        fields.map((f) => [f.key, data.envSecretRefs![f.key] ?? ""]),
      );
      setEditEnvRefValues(envValues);
    }
  }, [credentialWithSecretsQuery.data, credentialTypes, dialogMode, editingInstanceId]);

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
      const response = await fetch(ApiPaths.credentialInstance(instanceId), { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      closeDeleteCredentialConfirm();
      if (editingInstanceId === instanceId) closeDialog();
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const typesLoading = credentialTypesQuery.isLoading;
  const typesError = credentialTypesQuery.isError;
  const typesEmpty = credentialTypes.length === 0;

  const isDialogOpen = dialogMode !== null;
  const showTestFailureAlert = testResult?.status === "failing";

  return {
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
  };
}
