"use client";

import type { CredentialFieldSchema,CredentialTypeDefinition } from "@codemation/core/browser";
import { ApiPaths } from "@codemation/frontend-src/presentation/http/ApiPaths";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback,useEffect,useMemo,useState,type ReactNode } from "react";
import { CodemationDataTable } from "../components/CodemationDataTable";
import {
useCredentialInstancesQuery,
useCredentialInstanceWithSecretsQuery,
useCredentialTypesQuery,
type CredentialInstanceDto,
} from "../realtime/realtime";

type FormSourceKind = "db" | "env";

type DialogMode = "create" | "edit" | null;

function maskedDisplayValue(): string {
  return "••••••••••••";
}

function buildEmptySecretFieldValues(fields: ReadonlyArray<CredentialFieldSchema>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    out[f.key] = "";
  }
  return out;
}

function buildFieldStringValues(
  fields: ReadonlyArray<CredentialFieldSchema>,
  source?: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    out[field.key] = String(source?.[field.key] ?? "");
  }
  return out;
}

function HealthBadge({ status }: { status: string }) {
  const statusLower = status.toLowerCase();
  const variant =
    statusLower === "healthy"
      ? "healthy"
      : statusLower === "failing"
        ? "failing"
        : "unknown";
  return (
    <span className={`credentials-table__badge credentials-table__badge--${variant}`}>
      {status}
    </span>
  );
}

export function CredentialsScreen() {
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

  const selectedType = useMemo<CredentialTypeDefinition | undefined>(
    () => credentialTypes.find((type) => type.typeId === selectedTypeId),
    [credentialTypes, selectedTypeId],
  );
  const secretFields = selectedType?.secretFields ?? [];
  const editingInstance = useMemo(
    () => (editingInstanceId ? credentialInstances.find((i) => i.instanceId === editingInstanceId) : null),
    [credentialInstances, editingInstanceId],
  );
  const editingType = useMemo<CredentialTypeDefinition | undefined>(
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
      const data = event.data as Readonly<{ kind?: string; instanceId?: string; connectedEmail?: string; message?: string }>;
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
  }, [
    credentialWithSecretsQuery.data,
    credentialTypes,
    dialogMode,
    editingInstanceId,
  ]);

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

  return (
    <div data-testid="credentials-screen" className="credentials-screen">
      {showTestFailureAlert && (
        <div
          className="credentials-test-failure-alert"
          role="alert"
          data-testid="credential-test-failure-alert"
        >
          <div className="credentials-test-failure-alert__content">
            <strong className="credentials-test-failure-alert__title">Credential test failed</strong>
            <p className="credentials-test-failure-alert__message">{testResult.message || "Test failed"}</p>
          </div>
          <button
            type="button"
            className="credentials-test-failure-alert__dismiss"
            onClick={() => setTestResult(null)}
            aria-label="Dismiss"
            data-testid="credential-test-failure-alert-dismiss"
          >
            ×
          </button>
        </div>
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
        <CodemationDataTable
          tableTestId="credentials-table"
          columns={[
            { key: "name", header: "Name" },
            { key: "type", header: "Type" },
            { key: "source", header: "Source" },
            { key: "status", header: "Status" },
            { key: "health", header: "Health" },
            { key: "actions", header: "Actions" },
          ]}
        >
          {credentialInstances.map((instance) => (
            <tr key={instance.instanceId} data-testid={`credential-instance-row-${instance.instanceId}`}>
              <td>
                <button
                  type="button"
                  className="credentials-table__name-btn"
                  onClick={() => openEditDialog(instance)}
                  data-testid={`credential-instance-name-${instance.instanceId}`}
                >
                  {instance.displayName}
                </button>
              </td>
              <td>
                <span className="credentials-table__type">{instance.typeId}</span>
              </td>
              <td>
                <span className="credentials-table__badge credentials-table__badge--unknown">
                  {instance.sourceKind}
                </span>
              </td>
              <td>
                <span className="credentials-table__badge credentials-table__badge--unknown">
                  {instance.setupStatus}
                </span>
              </td>
              <td>
                <HealthBadge status={instance.latestHealth?.status ?? "unknown"} />
              </td>
              <td>
                <div className="credentials-table__actions">
                  {testResult?.instanceId === instance.instanceId && (
                    <span
                      className={`credentials-table__test-result credentials-table__test-result--${testResult.status}`}
                      data-testid={`credential-test-result-${instance.instanceId}`}
                    >
                      {testResult.status === "healthy" ? "Healthy" : "Failing"}
                    </span>
                  )}
                  <button
                    type="button"
                    className="credentials-table__btn credentials-table__btn--primary"
                    data-testid={`credential-instance-test-button-${instance.instanceId}`}
                    onClick={() => void testCredentialInstance(instance)}
                    disabled={activeTestInstanceId === instance.instanceId}
                  >
                    {activeTestInstanceId === instance.instanceId ? "Testing…" : "Test"}
                  </button>
                  <button
                    type="button"
                    className="credentials-table__btn credentials-table__btn--danger"
                    data-testid={`credential-instance-delete-button-${instance.instanceId}`}
                    onClick={() => openDeleteCredentialConfirm(instance)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </CodemationDataTable>
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

type CredentialConfirmVariant = "danger" | "primary";

type CredentialConfirmDialogProps = {
  title: string;
  titleElementId: string;
  testId: string;
  cancelTestId: string;
  confirmTestId: string;
  confirmLabel: string;
  confirmVariant: CredentialConfirmVariant;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
};

function CredentialConfirmDialog({
  title,
  titleElementId,
  testId,
  cancelTestId,
  confirmTestId,
  confirmLabel,
  confirmVariant,
  onCancel,
  onConfirm,
  children,
}: CredentialConfirmDialogProps) {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  const confirmClass =
    confirmVariant === "danger"
      ? "credential-dialog__btn credential-dialog__btn--danger"
      : "credential-dialog__btn credential-dialog__btn--primary";

  return (
    <div
      className="credential-dialog-overlay"
      onClick={handleBackdropClick}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleElementId}
      data-testid={testId}
    >
      <div className="credential-dialog">
        <div className="credential-dialog__header">
          <h2 id={titleElementId} className="credential-dialog__title">
            {title}
          </h2>
        </div>
        <div className="credential-dialog__body">{children}</div>
        <div className="credential-dialog__footer">
          <button
            type="button"
            className="credential-dialog__btn credential-dialog__btn--secondary"
            data-testid={cancelTestId}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="button" className={confirmClass} data-testid={confirmTestId} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CredentialDialogProps {
  mode: "create" | "edit";
  credentialTypes: ReadonlyArray<CredentialTypeDefinition>;
  typesLoading: boolean;
  typesError: boolean;
  typesEmpty: boolean;
  selectedTypeId: string;
  setSelectedTypeId: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  sourceKind: FormSourceKind;
  setSourceKind: (v: FormSourceKind) => void;
  publicFieldValues: Record<string, string>;
  setPublicFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  secretFieldValues: Record<string, string>;
  setSecretFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  envRefValues: Record<string, string>;
  setEnvRefValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showSecrets: boolean;
  setShowSecrets: React.Dispatch<React.SetStateAction<boolean>>;
  oauth2RedirectUri: string;
  isLoadingOauth2RedirectUri: boolean;
  secretsLoading?: boolean;
  editingInstance: CredentialInstanceDto | null | undefined;
  errorMessage: string | null;
  dialogTestResult: { status: string; message?: string } | null;
  isSubmitting: boolean;
  isDialogTesting: boolean;
  onCreate: () => Promise<void>;
  onUpdate: () => Promise<void>;
  onTest: () => Promise<void>;
  onConnectOAuth2: () => Promise<void>;
  onDisconnectOAuth2: () => void;
  onClose: () => void;
}

function CredentialDialog({
  mode,
  credentialTypes,
  typesLoading,
  typesError,
  typesEmpty,
  selectedTypeId,
  setSelectedTypeId,
  displayName,
  setDisplayName,
  sourceKind,
  setSourceKind,
  publicFieldValues,
  setPublicFieldValues,
  secretFieldValues,
  setSecretFieldValues,
  envRefValues,
  setEnvRefValues,
  showSecrets,
  setShowSecrets,
  oauth2RedirectUri,
  isLoadingOauth2RedirectUri,
  secretsLoading = false,
  editingInstance,
  errorMessage,
  dialogTestResult,
  isSubmitting,
  isDialogTesting,
  onCreate,
  onUpdate,
  onTest,
  onConnectOAuth2,
  onDisconnectOAuth2,
  onClose,
}: CredentialDialogProps) {
  const selectedType = credentialTypes.find((t) => t.typeId === selectedTypeId);
  const activeType = mode === "edit" && editingInstance
    ? credentialTypes.find((t) => t.typeId === editingInstance.typeId)
    : selectedType;
  const publicFields = (activeType?.publicFields ?? []) as ReadonlyArray<CredentialFieldSchema>;
  const secretFields = (activeType?.secretFields ?? []) as ReadonlyArray<CredentialFieldSchema>;
  const isOAuth2Type = activeType?.auth?.kind === "oauth2";
  const orderedFields = [...publicFields.map((field, index) => ({
    kind: "public" as const,
    field,
    order: field.order ?? index,
  })), ...secretFields.map((field, index) => ({
    kind: "secret" as const,
    field,
    order: field.order ?? publicFields.length + index,
  }))].sort((left, right) => left.order - right.order);

  const isEdit = mode === "edit";
  const isTypeLocked = isEdit && editingInstance != null;
  const isDbSecretSource = isEdit ? editingInstance?.sourceKind === "db" : sourceKind === "db";
  const canToggleSecrets = isDbSecretSource && secretFields.some((field) => field.type === "password");

  useEffect(() => {
    if (isEdit && editingInstance) {
      setDisplayName(editingInstance.displayName);
    }
  }, [isEdit, editingInstance?.instanceId, editingInstance?.displayName, setDisplayName]);

  const canSubmit =
    !isSubmitting &&
    displayName.trim().length > 0 &&
    !publicFields.some((field) => field.required && !(publicFieldValues[field.key] ?? "").trim()) &&
    (isEdit
      ? true
      : Boolean(selectedTypeId) &&
        (sourceKind === "db"
          ? !secretFields.some((f) => f.required && !(secretFieldValues[f.key] ?? "").trim())
          : !secretFields.some((f) => f.required && !(envRefValues[f.key] ?? "").trim())));
  const canTest = !isSubmitting && !isDialogTesting && (isEdit || canSubmit);

  const handleSubmit = () => {
    if (isEdit) void onUpdate();
    else void onCreate();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="credential-dialog-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="credential-dialog-title"
      data-testid="credential-dialog"
    >
      <div className="credential-dialog">
        <div className="credential-dialog__header">
          <h2 id="credential-dialog-title" className="credential-dialog__title">
            {isEdit ? "Edit credential" : "Add credential"}
          </h2>
        </div>
        <div className="credential-dialog__body">
          <div className="credential-dialog__field">
            <label htmlFor="credential-type-select" className="credential-dialog__label">
              Credential type
            </label>
            <select
              id="credential-type-select"
              className={`credential-dialog__select ${isTypeLocked ? "credential-dialog__select--disabled" : ""}`}
              data-testid="credential-type-select"
              value={selectedTypeId}
              onChange={(e) => setSelectedTypeId(e.target.value)}
              disabled={typesLoading || isTypeLocked}
              aria-disabled={isTypeLocked}
            >
              <option value="">Select a credential type</option>
              {credentialTypes.map((type) => (
                <option key={type.typeId} value={type.typeId}>
                  {type.displayName}
                </option>
              ))}
            </select>
            {typesLoading && <span className="credential-dialog__help">Loading…</span>}
            {typesError && (
              <span className="credential-dialog__error">Failed to load credential types.</span>
            )}
            {!typesLoading && !typesError && typesEmpty && (
              <span className="credential-dialog__help">No credential types available.</span>
            )}
          </div>

          <div className="credential-dialog__field">
            <label htmlFor="credential-display-name" className="credential-dialog__label">
              Display name
            </label>
            <input
              id="credential-display-name"
              type="text"
              className="credential-dialog__input"
              data-testid="credential-display-name-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. My Gmail account"
            />
          </div>

          {!isEdit && (
            <div className="credential-dialog__field">
              <label htmlFor="credential-source-kind" className="credential-dialog__label">
                Secret source
              </label>
              <select
                id="credential-source-kind"
                className="credential-dialog__select"
                data-testid="credential-source-kind-select"
                value={sourceKind}
                onChange={(e) => setSourceKind(e.target.value as FormSourceKind)}
              >
                <option value="db">Store secret in database</option>
                <option value="env">Load from environment variables</option>
              </select>
            </div>
          )}

          {canToggleSecrets && (
            <div className="credential-dialog__field">
              <button
                type="button"
                className="credential-dialog__btn credential-dialog__btn--secondary"
                style={{ width: "fit-content", padding: "var(--spacing-xs) var(--spacing-sm)", fontSize: "0.875rem" }}
                onClick={() => setShowSecrets((s) => !s)}
                data-testid="credential-show-secrets-toggle"
                disabled={isEdit && secretsLoading}
              >
                {showSecrets ? "Hide" : "Show"} values
              </button>
              {isEdit && secretsLoading && (
                <span className="credential-dialog__help">Loading credential…</span>
              )}
            </div>
          )}

          {isOAuth2Type && (
            <div className="credential-dialog__field">
              <span className="credential-dialog__label">OAuth2 connection</span>
              {isLoadingOauth2RedirectUri ? (
                <span className="credential-dialog__help">Loading redirect URI…</span>
              ) : (
                <>
                  <input
                    className="credential-dialog__input"
                    data-testid="credential-oauth2-redirect-uri"
                    type="text"
                    readOnly
                    value={oauth2RedirectUri}
                  />
                  <span className="credential-dialog__help">
                    Configure this redirect URI in your OAuth client before connecting.
                  </span>
                </>
              )}
              {isEdit && editingInstance?.oauth2Connection?.status === "connected" && (
                <span className="credential-dialog__help" data-testid="credential-oauth2-connected-status">
                  Connected
                  {editingInstance.oauth2Connection.connectedEmail
                    ? ` as ${editingInstance.oauth2Connection.connectedEmail}`
                    : ""}
                </span>
              )}
              <div style={{ display: "flex", gap: "var(--spacing-sm)", flexWrap: "wrap", marginTop: "var(--spacing-sm)" }}>
                <button
                  type="button"
                  className="credential-dialog__btn credential-dialog__btn--secondary"
                  data-testid="credential-oauth2-connect-button"
                  onClick={() => void onConnectOAuth2()}
                  disabled={!isEdit && !canSubmit}
                >
                  {isEdit
                    ? editingInstance?.oauth2Connection?.status === "connected" ? "Reconnect" : "Connect"
                    : "Create and connect"}
                </button>
                {isEdit && (
                  <button
                    type="button"
                    className="credential-dialog__btn credential-dialog__btn--secondary"
                    data-testid="credential-oauth2-disconnect-button"
                    onClick={() => void onDisconnectOAuth2()}
                    disabled={editingInstance?.oauth2Connection?.status !== "connected"}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          )}

          {orderedFields.map(({ kind, field }) => {
            if (kind === "public") {
              return (
                <label key={`public-${field.key}`} className="credential-dialog__field">
                  <span className="credential-dialog__label">
                    {field.label}
                    {field.required ? " *" : ""}
                  </span>
                  {field.type === "textarea" ? (
                    <textarea
                      className="credential-dialog__textarea"
                      data-testid={`credential-public-${field.key}`}
                      rows={4}
                      value={publicFieldValues[field.key] ?? ""}
                      onChange={(e) =>
                        setPublicFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <input
                      className="credential-dialog__input"
                      data-testid={`credential-public-${field.key}`}
                      type={field.type === "password" ? "password" : "text"}
                      value={publicFieldValues[field.key] ?? ""}
                      onChange={(e) =>
                        setPublicFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                    />
                  )}
                  {field.helpText && <span className="credential-dialog__help">{field.helpText}</span>}
                </label>
              );
            }
            if (isDbSecretSource) {
              const raw = secretFieldValues[field.key] ?? "";
              const isMasked = isEdit && field.type === "password" && !showSecrets && raw.length > 0;
              const displayValue = isMasked ? maskedDisplayValue() : raw;
              return (
                <label key={`secret-${field.key}`} className="credential-dialog__field">
                  <span className="credential-dialog__label">
                    {field.label}
                    {field.required ? " *" : ""}
                  </span>
                  {field.type === "textarea" ? (
                    <textarea
                      className="credential-dialog__textarea"
                      data-testid={`credential-secret-${field.key}`}
                      rows={4}
                      value={displayValue}
                      onChange={(e) =>
                        setSecretFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      readOnly={isMasked}
                      placeholder={isEdit ? undefined : field.placeholder}
                    />
                  ) : (
                    <input
                      className="credential-dialog__input"
                      data-testid={`credential-secret-${field.key}`}
                      type={showSecrets && field.type === "password" ? "text" : field.type === "password" ? "password" : "text"}
                      value={displayValue}
                      onChange={(e) =>
                        setSecretFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      readOnly={isMasked}
                      placeholder={isEdit ? undefined : field.placeholder}
                    />
                  )}
                  {field.helpText && (
                    <span className="credential-dialog__help">{field.helpText}</span>
                  )}
                  {isEdit && (
                    <span className="credential-dialog__help">
                      Leave blank to keep existing value
                    </span>
                  )}
                </label>
              );
            }
            const displayEnv = envRefValues[field.key] ?? "";
            return (
              <label key={`env-${field.key}`} className="credential-dialog__field">
                <span className="credential-dialog__label">
                  Env var for {field.label}
                  {field.required ? " *" : ""}
                </span>
                <input
                  className="credential-dialog__input"
                  data-testid={`credential-env-${field.key}`}
                  type="text"
                  value={displayEnv}
                  onChange={(e) =>
                    setEnvRefValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={
                    isEdit ? undefined : field.placeholder ?? `e.g. GMAIL_${field.key.toUpperCase()}`
                  }
                />
                {field.helpText && (
                  <span className="credential-dialog__help">{field.helpText}</span>
                )}
                {isEdit && (
                  <span className="credential-dialog__help">
                    Leave blank to keep existing value
                  </span>
                )}
              </label>
            );
          })}

          {errorMessage && (
            <div className="credential-dialog__error" data-testid="credentials-error">
              {errorMessage}
            </div>
          )}
          {dialogTestResult && (
            <div
              className={`credentials-table__test-result credentials-table__test-result--${dialogTestResult.status}`}
              data-testid="credential-dialog-test-result"
            >
              {dialogTestResult.status === "healthy" ? "Healthy" : "Failing"}
              {dialogTestResult.message ? `: ${dialogTestResult.message}` : ""}
            </div>
          )}
        </div>
        <div className="credential-dialog__footer">
          <button
            type="button"
            className="credential-dialog__btn credential-dialog__btn--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="credential-dialog__btn credential-dialog__btn--secondary"
            data-testid="credential-test-button"
            disabled={!canTest}
            onClick={() => void onTest()}
          >
            {isDialogTesting ? "Testing…" : "Test"}
          </button>
          <button
            type="button"
            className="credential-dialog__btn credential-dialog__btn--primary"
            data-testid={isEdit ? "credential-save-button" : "credential-create-button"}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isSubmitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
