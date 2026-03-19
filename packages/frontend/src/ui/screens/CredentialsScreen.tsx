"use client";

import type { CredentialFieldSchema } from "@codemation/core/browser";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useCredentialInstancesQuery,
  useCredentialInstanceWithSecretsQuery,
  useCredentialTypesQuery,
  type CredentialInstanceDto,
} from "../realtime/realtime";
import { ApiPaths } from "../../presentation/http/ApiPaths";

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
  const [secretFieldValues, setSecretFieldValues] = useState<Record<string, string>>({});
  const [envRefValues, setEnvRefValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTestInstanceId, setActiveTestInstanceId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ instanceId: string; status: string; message?: string } | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editSecretFieldValues, setEditSecretFieldValues] = useState<Record<string, string>>({});
  const [editEnvRefValues, setEditEnvRefValues] = useState<Record<string, string>>({});
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

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
    ]);
  }, [queryClient]);

  const openCreateDialog = useCallback(() => {
    setDialogMode("create");
    setSelectedTypeId("");
    setDisplayName("");
    setSourceKind("db");
    setSecretFieldValues({});
    setEnvRefValues({});
    setErrorMessage(null);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setEditingInstanceId(null);
    setShowSecrets(false);
    setErrorMessage(null);
  }, []);

  const createCredentialInstance = async (): Promise<void> => {
    if (!selectedType) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
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
      const response = await fetch(ApiPaths.credentialInstances(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          typeId: selectedTypeId,
          displayName: displayName.trim(),
          sourceKind,
          secretConfig,
          envSecretRefs,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setDisplayName("");
      resetCreateForm();
      closeDialog();
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
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
      const updateBody: { displayName: string; secretConfig?: Record<string, unknown>; envSecretRefs?: Record<string, string> } = {
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
    setDialogMode("edit");
    setEditingInstanceId(instance.instanceId);
    setSelectedTypeId(instance.typeId);
    setEditDisplayName(instance.displayName);
    setEditSecretFieldValues({});
    setEditEnvRefValues({});
    setShowSecrets(false);
    setErrorMessage(null);
  };

  useEffect(() => {
    const data = credentialWithSecretsQuery.data;
    if (!data || editingInstanceId !== data.instanceId || dialogMode !== "edit") return;
    const type = credentialTypes.find((t) => t.typeId === data.typeId);
    const fields = type?.secretFields ?? [];
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

  const deleteCredentialInstance = async (instanceId: string): Promise<void> => {
    if (!confirm("Delete this credential instance? This cannot be undone.")) return;
    try {
      setErrorMessage(null);
      const response = await fetch(ApiPaths.credentialInstance(instanceId), { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
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
        <table className="credentials-table" data-testid="credentials-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Source</th>
                <th>Status</th>
                <th>Health</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
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
                        onClick={() => void deleteCredentialInstance(instance.instanceId)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          secretFieldValues={dialogMode === "create" ? secretFieldValues : editSecretFieldValues}
          setSecretFieldValues={dialogMode === "create" ? setSecretFieldValues : setEditSecretFieldValues}
          envRefValues={dialogMode === "create" ? envRefValues : editEnvRefValues}
          setEnvRefValues={dialogMode === "create" ? setEnvRefValues : setEditEnvRefValues}
          showSecrets={showSecrets}
          setShowSecrets={setShowSecrets}
          secretsLoading={credentialWithSecretsQuery.isLoading}
          editingInstance={editingInstance}
          errorMessage={errorMessage}
          isSubmitting={dialogMode === "create" ? isSubmitting : isEditSubmitting}
          onCreate={createCredentialInstance}
          onUpdate={updateCredentialInstance}
          onClose={closeDialog}
          buildEmptySecretFieldValues={buildEmptySecretFieldValues}
        />
      )}
    </div>
  );
}

interface CredentialDialogProps {
  mode: "create" | "edit";
  credentialTypes: ReadonlyArray<{ typeId: string; displayName: string; secretFields?: ReadonlyArray<CredentialFieldSchema> }>;
  typesLoading: boolean;
  typesError: boolean;
  typesEmpty: boolean;
  selectedTypeId: string;
  setSelectedTypeId: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  sourceKind: FormSourceKind;
  setSourceKind: (v: FormSourceKind) => void;
  secretFieldValues: Record<string, string>;
  setSecretFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  envRefValues: Record<string, string>;
  setEnvRefValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showSecrets: boolean;
  setShowSecrets: React.Dispatch<React.SetStateAction<boolean>>;
  secretsLoading?: boolean;
  editingInstance: CredentialInstanceDto | null | undefined;
  errorMessage: string | null;
  isSubmitting: boolean;
  onCreate: () => Promise<void>;
  onUpdate: () => Promise<void>;
  onClose: () => void;
  buildEmptySecretFieldValues: (fields: ReadonlyArray<CredentialFieldSchema>) => Record<string, string>;
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
  secretFieldValues,
  setSecretFieldValues,
  envRefValues,
  setEnvRefValues,
  showSecrets,
  setShowSecrets,
  secretsLoading = false,
  editingInstance,
  errorMessage,
  isSubmitting,
  onCreate,
  onUpdate,
  onClose,
  buildEmptySecretFieldValues,
}: CredentialDialogProps) {
  const selectedType = credentialTypes.find((t) => t.typeId === selectedTypeId);
  const secretFields = (mode === "edit" && editingInstance
    ? credentialTypes.find((t) => t.typeId === editingInstance.typeId)?.secretFields ?? []
    : selectedType?.secretFields ?? []) as ReadonlyArray<CredentialFieldSchema>;

  const isEdit = mode === "edit";
  const isTypeLocked = isEdit && editingInstance != null;

  useEffect(() => {
    if (isEdit && editingInstance) {
      setDisplayName(editingInstance.displayName);
    }
  }, [isEdit, editingInstance?.instanceId, editingInstance?.displayName, setDisplayName]);

  const canSubmit =
    !isSubmitting &&
    displayName.trim().length > 0 &&
    (isEdit
      ? true
      : Boolean(selectedTypeId) &&
        (sourceKind === "db"
          ? !secretFields.some((f) => f.required && !(secretFieldValues[f.key] ?? "").trim())
          : !secretFields.some((f) => f.required && !(envRefValues[f.key] ?? "").trim())));

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

          {secretFields.length > 0 && (
            <>
              {(isEdit ? editingInstance?.sourceKind === "db" : sourceKind === "db") ? (
                <div className="credential-dialog__field">
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-md)", flexWrap: "wrap" }}>
                    <span className="credential-dialog__label">
                      {isEdit ? "Update secrets (optional, leave blank to keep)" : "Secret values"}
                    </span>
                    {isEdit && (
                      <button
                        type="button"
                        className="credential-dialog__btn credential-dialog__btn--secondary"
                        style={{ padding: "var(--spacing-xs) var(--spacing-sm)", fontSize: "0.875rem" }}
                        onClick={() => setShowSecrets((s) => !s)}
                        data-testid="credential-show-secrets-toggle"
                        disabled={secretsLoading}
                      >
                        {showSecrets ? "Hide" : "Show"} values
                      </button>
                    )}
                  </div>
                  {isEdit && secretsLoading && (
                    <span className="credential-dialog__help">Loading credential…</span>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-md)" }}>
                    {secretFields.map((field) => {
                      const raw = secretFieldValues[field.key] ?? "";
                      const isMasked = isEdit && !showSecrets && raw.length > 0;
                      const displayValue = isMasked ? maskedDisplayValue() : raw;
                      return (
                        <label key={field.key} className="credential-dialog__field">
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
                    })}
                  </div>
                </div>
              ) : (
                <div className="credential-dialog__field">
                  <span className="credential-dialog__label">Environment variable names</span>
                  {isEdit && secretsLoading && (
                    <span className="credential-dialog__help">Loading credential…</span>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-md)" }}>
                    {secretFields.map((field) => {
                      const displayEnv = envRefValues[field.key] ?? "";
                      return (
                        <label key={field.key} className="credential-dialog__field">
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
                  </div>
                </div>
              )}
            </>
          )}

          {errorMessage && (
            <div className="credential-dialog__error" data-testid="credentials-error">
              {errorMessage}
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
