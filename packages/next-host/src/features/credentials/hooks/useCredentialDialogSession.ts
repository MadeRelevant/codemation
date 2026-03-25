import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { codemationApiClient } from "../../../api/CodemationApiClient";
import { CodemationApiHttpError } from "../../../api/CodemationApiHttpError";
import {
  useCredentialFieldEnvStatusQuery,
  useCredentialInstancesQuery,
  useCredentialInstanceWithSecretsQuery,
  useCredentialTypesQuery,
  type CredentialInstanceDto,
} from "../../workflows/hooks/realtime/realtime";
import { credentialFieldEnvStatusQueryKey } from "../../workflows/lib/realtime/realtimeQueryKeys";
import { parseCredentialInstanceTestPayload } from "../lib/credentialInstanceTestPayloadParser";
import { buildEmptySecretFieldValues, buildFieldStringValues } from "../lib/credentialFieldHelpers";
import type { FormSourceKind } from "../lib/credentialFormTypes";
import type { CredentialDialogProps } from "../components/CredentialDialog";

type DialogMode = "create" | "edit" | null;

export type CredentialDialogSessionOptions = Readonly<{
  workflowId?: string;
  onCredentialCreated?: (instance: CredentialInstanceDto) => void;
  closeAfterCreatePolicy: "always" | "unless_oauth2";
  oauthConnectedPolicy: "close_dialog" | "refresh_only";
  /** When true, build {@link CredentialDialogProps} for embedding; the credentials page passes props manually. */
  buildDialogProps: boolean;
}>;

/**
 * Shared create/edit/test/OAuth state for {@link useCredentialsScreen} and {@link useCredentialCreateDialog}.
 */
export function useCredentialDialogSession(options: CredentialDialogSessionOptions) {
  const { workflowId, onCredentialCreated, closeAfterCreatePolicy, oauthConnectedPolicy, buildDialogProps } = options;
  const queryClient = useQueryClient();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [acceptedTypeFilter, setAcceptedTypeFilter] = useState<ReadonlyArray<string> | null>(null);
  const credentialTypesQuery = useCredentialTypesQuery();
  const credentialFieldEnvStatusQuery = useCredentialFieldEnvStatusQuery();
  const credentialInstancesQuery = useCredentialInstancesQuery();
  const credentialWithSecretsQuery = useCredentialInstanceWithSecretsQuery(
    dialogMode === "edit" ? editingInstanceId : null,
  );
  const credentialTypesAll = credentialTypesQuery.data ?? [];
  const credentialFieldEnvStatus = credentialFieldEnvStatusQuery.data ?? {};
  const credentialInstances = credentialInstancesQuery.data ?? [];
  const credentialTypes = useMemo(() => {
    if (!acceptedTypeFilter || acceptedTypeFilter.length === 0) {
      return credentialTypesAll;
    }
    return credentialTypesAll.filter((t) => acceptedTypeFilter.includes(t.typeId));
  }, [acceptedTypeFilter, credentialTypesAll]);

  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [sourceKind, setSourceKind] = useState<FormSourceKind>("db");
  const [publicFieldValues, setPublicFieldValues] = useState<Record<string, string>>({});
  const [secretFieldValues, setSecretFieldValues] = useState<Record<string, string>>({});
  const [envRefValues, setEnvRefValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    () => credentialTypesAll.find((t) => t.typeId === editingInstance?.typeId),
    [credentialTypesAll, editingInstance?.typeId],
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
    const tasks = [
      queryClient.invalidateQueries({ queryKey: ["credential-instances"] }),
      queryClient.invalidateQueries({ queryKey: ["credential-types"] }),
      queryClient.invalidateQueries({ queryKey: ["credential-instance-with-secrets"] }),
      queryClient.invalidateQueries({ queryKey: credentialFieldEnvStatusQueryKey }),
    ];
    if (workflowId) {
      tasks.push(queryClient.invalidateQueries({ queryKey: ["workflow-credential-health", workflowId] }));
    }
    await Promise.all(tasks);
  }, [queryClient, workflowId]);

  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setEditingInstanceId(null);
    setAcceptedTypeFilter(null);
    setSelectedTypeId("");
    setDisplayName("");
    setSourceKind("db");
    setPublicFieldValues({});
    setSecretFieldValues({});
    setEnvRefValues({});
    setErrorMessage(null);
    setDialogTestResult(null);
    setShowSecrets(false);
    setOauth2RedirectUri("");
    setOauthDisconnectConfirmOpen(false);
  }, []);

  const openCreateDialog = useCallback(
    (acceptedTypeIds?: ReadonlyArray<string>) => {
      setDialogMode("create");
      setEditingInstanceId(null);
      setAcceptedTypeFilter(acceptedTypeIds && acceptedTypeIds.length > 0 ? [...acceptedTypeIds] : null);
      setErrorMessage(null);
      setDialogTestResult(null);
      setShowSecrets(false);
      setSourceKind("db");
      const types =
        acceptedTypeIds && acceptedTypeIds.length > 0
          ? credentialTypesAll.filter((t) => acceptedTypeIds.includes(t.typeId))
          : credentialTypesAll;
      const first = types[0];
      setSelectedTypeId(first?.typeId ?? "");
      setDisplayName("");
      setPublicFieldValues(first ? buildFieldStringValues(first.publicFields ?? []) : {});
      setSecretFieldValues(first ? buildEmptySecretFieldValues(first.secretFields ?? []) : {});
      setEnvRefValues(first ? buildEmptySecretFieldValues(first.secretFields ?? []) : {});
    },
    [credentialTypesAll],
  );

  const openEditDialog = useCallback(
    (instance: CredentialInstanceDto): void => {
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
    },
    [credentialTypes],
  );

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
          ? (Object.fromEntries(secretFields.map((f) => [f.key, secretFieldValues[f.key] ?? ""])) as Record<
              string,
              unknown
            >)
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
      const created = await codemationApiClient.postJson<CredentialInstanceDto>(ApiPaths.credentialInstances(), {
        typeId: selectedTypeId,
        displayName: displayName.trim(),
        sourceKind,
        publicConfig,
        secretConfig,
        envSecretRefs,
      });
      const createdType = credentialTypesAll.find((type) => type.typeId === created.typeId);
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
      onCredentialCreated?.(created);
      return created;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    credentialTypesAll,
    dialogMode,
    editingInstance,
    envRefValues,
    onCredentialCreated,
    publicFieldValues,
    refreshQueries,
    secretFieldValues,
    secretFields,
    selectedType,
    selectedTypeId,
    sourceKind,
  ]);

  const createCredentialInstance = useCallback(async (): Promise<void> => {
    const created = await ensureDialogCredentialInstance();
    if (!created) {
      return;
    }
    if (closeAfterCreatePolicy === "always") {
      closeDialog();
      return;
    }
    const t = credentialTypesAll.find((type) => type.typeId === created.typeId);
    if (t?.auth?.kind !== "oauth2") {
      closeDialog();
    }
  }, [closeAfterCreatePolicy, closeDialog, credentialTypesAll, ensureDialogCredentialInstance]);

  const updateCredentialInstance = useCallback(async (): Promise<void> => {
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
      await codemationApiClient.putJson(ApiPaths.credentialInstance(editingInstanceId), updateBody);
      closeDialog();
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsEditSubmitting(false);
    }
  }, [
    closeDialog,
    editEnvRefValues,
    editPublicFieldValues,
    editSecretFieldValues,
    editingInstance,
    editingInstanceId,
    editingType,
    credentialWithSecretsQuery.data,
    refreshQueries,
  ]);

  const connectOAuth2Credential = useCallback(async (): Promise<void> => {
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
  }, [ensureDialogCredentialInstance]);

  const executeOAuthDisconnect = useCallback(async (): Promise<void> => {
    if (!editingInstanceId) {
      setOauthDisconnectConfirmOpen(false);
      return;
    }
    const instanceId = editingInstanceId;
    try {
      setOauthDisconnectConfirmOpen(false);
      setErrorMessage(null);
      await codemationApiClient.postJson(ApiPaths.oauth2Disconnect(instanceId));
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [editingInstanceId, refreshQueries]);

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
        const data = await codemationApiClient.getJson<{ redirectUri?: string }>(ApiPaths.oauth2RedirectUri());
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
        if (oauthConnectedPolicy === "close_dialog") {
          closeDialog();
        }
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
  }, [closeDialog, oauthConnectedPolicy, refreshQueries]);

  useEffect(() => {
    const data = credentialWithSecretsQuery.data;
    if (!data || editingInstanceId !== data.instanceId || dialogMode !== "edit") return;
    const type = credentialTypesAll.find((t) => t.typeId === data.typeId);
    const fields = type?.secretFields ?? [];
    setEditPublicFieldValues(buildFieldStringValues(type?.publicFields ?? [], data.publicConfig));
    if (data.sourceKind === "db" && data.secretConfig) {
      const values = Object.fromEntries(fields.map((f) => [f.key, data.secretConfig![f.key] ?? ""]));
      setEditSecretFieldValues(values);
      setEditEnvRefValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
    } else if (data.sourceKind === "env" && data.envSecretRefs) {
      setEditSecretFieldValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
      const envValues = Object.fromEntries(fields.map((f) => [f.key, data.envSecretRefs![f.key] ?? ""]));
      setEditEnvRefValues(envValues);
    }
  }, [credentialWithSecretsQuery.data, credentialTypesAll, dialogMode, editingInstanceId]);

  const testCredentialFromDialog = useCallback(async (): Promise<void> => {
    const targetInstance = await ensureDialogCredentialInstance();
    if (!targetInstance) {
      return;
    }
    try {
      setIsDialogTesting(true);
      setDialogTestResult(null);
      setErrorMessage(null);
      const data = await codemationApiClient.postJson<{ status?: string; message?: string }>(
        ApiPaths.credentialInstanceTest(targetInstance.instanceId),
      );
      setDialogTestResult({
        status: data?.status ?? "healthy",
        message: data?.message,
      });
      await refreshQueries();
    } catch (error) {
      if (error instanceof CodemationApiHttpError) {
        const parsed = parseCredentialInstanceTestPayload(error.bodyText);
        setDialogTestResult({
          status: "failing",
          message: parsed.message ?? "Test failed",
        });
        return;
      }
      setDialogTestResult({
        status: "failing",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDialogTesting(false);
    }
  }, [ensureDialogCredentialInstance, refreshQueries]);

  const typesLoading = credentialTypesQuery.isLoading;
  const typesError = credentialTypesQuery.isError;
  const typesEmpty = credentialTypes.length === 0;

  const dialogProps: CredentialDialogProps | null = useMemo(() => {
    if (!buildDialogProps || dialogMode === null) {
      return null;
    }
    const isEdit = dialogMode === "edit";
    return {
      mode: isEdit ? "edit" : "create",
      credentialTypes: isEdit ? credentialTypesAll : credentialTypes,
      typesLoading,
      typesError,
      typesEmpty,
      selectedTypeId,
      setSelectedTypeId,
      displayName: isEdit ? editDisplayName : displayName,
      setDisplayName: isEdit ? setEditDisplayName : setDisplayName,
      sourceKind,
      setSourceKind,
      publicFieldValues: isEdit ? editPublicFieldValues : publicFieldValues,
      setPublicFieldValues: isEdit ? setEditPublicFieldValues : setPublicFieldValues,
      secretFieldValues: isEdit ? editSecretFieldValues : secretFieldValues,
      setSecretFieldValues: isEdit ? setEditSecretFieldValues : setSecretFieldValues,
      envRefValues: isEdit ? editEnvRefValues : envRefValues,
      setEnvRefValues: isEdit ? setEditEnvRefValues : setEnvRefValues,
      showSecrets,
      setShowSecrets,
      oauth2RedirectUri,
      isLoadingOauth2RedirectUri,
      secretsLoading: credentialWithSecretsQuery.isLoading,
      editingInstance: isEdit ? editingInstance : undefined,
      errorMessage,
      dialogTestResult,
      isSubmitting: isEdit ? isEditSubmitting : isSubmitting,
      isDialogTesting,
      onCreate: createCredentialInstance,
      onUpdate: updateCredentialInstance,
      onTest: testCredentialFromDialog,
      onConnectOAuth2: connectOAuth2Credential,
      onDisconnectOAuth2: () => setOauthDisconnectConfirmOpen(true),
      onClose: closeDialog,
      credentialFieldEnvStatus,
    };
  }, [
    buildDialogProps,
    connectOAuth2Credential,
    createCredentialInstance,
    credentialFieldEnvStatus,
    credentialTypes,
    credentialTypesAll,
    credentialWithSecretsQuery.isLoading,
    dialogMode,
    dialogTestResult,
    displayName,
    editDisplayName,
    editEnvRefValues,
    editPublicFieldValues,
    editSecretFieldValues,
    editingInstance,
    envRefValues,
    errorMessage,
    isDialogTesting,
    isEditSubmitting,
    isSubmitting,
    oauth2RedirectUri,
    isLoadingOauth2RedirectUri,
    publicFieldValues,
    secretFieldValues,
    selectedTypeId,
    showSecrets,
    sourceKind,
    testCredentialFromDialog,
    typesEmpty,
    typesError,
    typesLoading,
    updateCredentialInstance,
    closeDialog,
  ]);

  const cancelOAuthDisconnect = useCallback(() => {
    setOauthDisconnectConfirmOpen(false);
  }, []);

  return {
    credentialInstances,
    credentialTypes,
    credentialTypesAll,
    credentialFieldEnvStatus,
    credentialTypesQuery,
    credentialInstancesQuery,
    credentialWithSecretsQuery,
    editingInstance,
    editingType,
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
    dialogTestResult,
    isSubmitting,
    isEditSubmitting,
    isDialogTesting,
    typesLoading,
    typesError,
    typesEmpty,
    createCredentialInstance,
    updateCredentialInstance,
    testCredentialFromDialog,
    connectOAuth2Credential,
    closeDialog,
    openCreateDialog,
    openEditDialog,
    refreshQueries,
    ensureDialogCredentialInstance,
    dialogProps,
    oauthDisconnectConfirmOpen,
    setOauthDisconnectConfirmOpen,
    executeOAuthDisconnect,
    cancelOAuthDisconnect,
  };
}
