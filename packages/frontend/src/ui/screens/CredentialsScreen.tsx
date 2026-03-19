"use client";

import type { CredentialFieldSchema } from "@codemation/core/browser";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useCredentialInstancesQuery,
  useCredentialTypesQuery,
  type CredentialInstanceDto,
} from "../realtime/realtime";
import { ApiPaths } from "../../presentation/http/ApiPaths";

type FormSourceKind = "db" | "env";

function buildEmptySecretFieldValues(fields: ReadonlyArray<CredentialFieldSchema>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    out[f.key] = "";
  }
  return out;
}

export function CredentialsScreen() {
  const queryClient = useQueryClient();
  const credentialTypesQuery = useCredentialTypesQuery();
  const credentialInstancesQuery = useCredentialInstancesQuery();
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
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editSecretFieldValues, setEditSecretFieldValues] = useState<Record<string, string>>({});
  const [editEnvRefValues, setEditEnvRefValues] = useState<Record<string, string>>({});
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

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
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateCredentialInstance = async (): Promise<void> => {
    if (!editingInstanceId || !editingType || !editingInstance) return;
    try {
      setIsEditSubmitting(true);
      setErrorMessage(null);
      const secretFieldsEdit = editingType.secretFields ?? [];
      const isDb = editingInstance.sourceKind === "db";
      const secretConfig = isDb
        ? (Object.fromEntries(
            secretFieldsEdit.map((f) => [f.key, editSecretFieldValues[f.key] ?? ""]),
          ) as Record<string, unknown>)
        : undefined;
      const envSecretRefs =
        !isDb && editingInstance.sourceKind === "env"
          ? (Object.fromEntries(
              secretFieldsEdit
                .map((f) => [f.key, editEnvRefValues[f.key] ?? ""])
                .filter(([, v]) => String(v).length > 0) as [string, string][],
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
      setEditingInstanceId(null);
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
      setErrorMessage(null);
      const response = await fetch(ApiPaths.credentialInstanceTest(instance.instanceId), {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActiveTestInstanceId(null);
    }
  };

  const startEdit = (instance: CredentialInstanceDto): void => {
    const type = credentialTypes.find((t) => t.typeId === instance.typeId);
    setEditingInstanceId(instance.instanceId);
    setEditDisplayName(instance.displayName);
    setEditSecretFieldValues(type ? buildEmptySecretFieldValues(type.secretFields ?? []) : {});
    setEditEnvRefValues(type ? buildEmptySecretFieldValues(type.secretFields ?? []) : {});
  };

  const cancelEdit = (): void => {
    setEditingInstanceId(null);
  };

  const deleteCredentialInstance = async (instanceId: string): Promise<void> => {
    if (!confirm("Delete this credential instance? This cannot be undone.")) return;
    try {
      setErrorMessage(null);
      const response = await fetch(ApiPaths.credentialInstance(instanceId), { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      if (editingInstanceId === instanceId) setEditingInstanceId(null);
      await refreshQueries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const typesLoading = credentialTypesQuery.isLoading;
  const typesError = credentialTypesQuery.isError;
  const typesEmpty = credentialTypes.length === 0;

  return (
    <div data-testid="credentials-screen" style={{ padding: 24, display: "grid", gap: 24 }}>
      <div>
        <a href="/workflows" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>
          Workflows
        </a>
        <h1 style={{ margin: "12px 0 4px" }}>Credentials</h1>
        <p style={{ margin: 0, opacity: 0.72 }}>
          Create credential instances, store secrets safely, and verify health before binding them to workflow slots.
        </p>
      </div>

      <section
        data-testid="credentials-create-panel"
        style={{ border: "1px solid #d1d5db", background: "#fff", padding: 16, display: "grid", gap: 12 }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.7 }}>
          Create instance
        </div>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Credential type</span>
          <select
            data-testid="credential-type-select"
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
            disabled={typesLoading}
          >
            <option value="">Select a credential type</option>
            {credentialTypes.map((type) => (
              <option key={type.typeId} value={type.typeId}>
                {type.displayName}
              </option>
            ))}
          </select>
        </label>
        {typesLoading && <div style={{ fontSize: 13, opacity: 0.8 }}>Loading credential types…</div>}
        {typesError && (
          <div style={{ color: "#b91c1c", fontSize: 13 }}>
            Failed to load credential types. Check the server and try again.
          </div>
        )}
        {!typesLoading && !typesError && typesEmpty && (
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            No credential types available. Ensure the app has loaded plugins (e.g. Gmail, OpenAI) that register
            credential types.
          </div>
        )}

        <label style={{ display: "grid", gap: 6 }}>
          <span>Display name</span>
          <input
            data-testid="credential-display-name-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Secret source</span>
          <select
            data-testid="credential-source-kind-select"
            value={sourceKind}
            onChange={(e) => setSourceKind(e.target.value as FormSourceKind)}
          >
            <option value="db">Store secret in database</option>
            <option value="env">Load secret from environment variables</option>
          </select>
        </label>

        {selectedType && secretFields.length > 0 && (
          <>
            {sourceKind === "db" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Secret values</span>
                {secretFields.map((field) => (
                  <label key={field.key} style={{ display: "grid", gap: 4 }}>
                    <span>
                      {field.label}
                      {field.required ? " *" : ""}
                    </span>
                    {field.type === "textarea" ? (
                      <textarea
                        data-testid={`credential-secret-${field.key}`}
                        rows={4}
                        value={secretFieldValues[field.key] ?? ""}
                        onChange={(e) =>
                          setSecretFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <input
                        data-testid={`credential-secret-${field.key}`}
                        type={field.type === "password" ? "password" : "text"}
                        value={secretFieldValues[field.key] ?? ""}
                        onChange={(e) =>
                          setSecretFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                      />
                    )}
                    {field.helpText ? (
                      <span style={{ fontSize: 12, opacity: 0.72 }}>{field.helpText}</span>
                    ) : null}
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Environment variable names (one per secret field)
                </span>
                {secretFields.map((field) => (
                  <label key={field.key} style={{ display: "grid", gap: 4 }}>
                    <span>
                      Env var for {field.label}
                      {field.required ? " *" : ""}
                    </span>
                    <input
                      data-testid={`credential-env-${field.key}`}
                      type="text"
                      value={envRefValues[field.key] ?? ""}
                      onChange={(e) =>
                        setEnvRefValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.placeholder ?? `e.g. GMAIL_${field.key.toUpperCase()}`}
                    />
                    {field.helpText ? (
                      <span style={{ fontSize: 12, opacity: 0.72 }}>{field.helpText}</span>
                    ) : null}
                  </label>
                ))}
              </div>
            )}
          </>
        )}

        <button
          type="button"
          data-testid="credential-create-button"
          disabled={
            isSubmitting ||
            !selectedTypeId ||
            displayName.trim().length === 0 ||
            (sourceKind === "db" &&
              secretFields.some((f) => f.required && !(secretFieldValues[f.key] ?? "").trim())) ||
            (sourceKind === "env" &&
              secretFields.some((f) => f.required && !(envRefValues[f.key] ?? "").trim()))
          }
          onClick={() => void createCredentialInstance()}
          style={{ width: "fit-content", padding: "8px 12px", fontWeight: 700 }}
        >
          {isSubmitting ? "Creating…" : "Create credential"}
        </button>
        {errorMessage ? (
          <div data-testid="credentials-error" style={{ color: "#b91c1c" }}>
            {errorMessage}
          </div>
        ) : null}
      </section>

      <section data-testid="credentials-list-panel" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.7 }}>
          Saved instances
        </div>
        {credentialInstances.length === 0 ? (
          <div style={{ opacity: 0.72 }}>No credential instances created yet.</div>
        ) : (
          credentialInstances.map((instance) => (
            <article
              key={instance.instanceId}
              data-testid={`credential-instance-card-${instance.instanceId}`}
              style={{
                border: "1px solid #d1d5db",
                background: "#fff",
                padding: 16,
                display: "grid",
                gap: 8,
              }}
            >
              {editingInstanceId === instance.instanceId && editingType ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ fontWeight: 800 }}>Edit credential</div>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span>Display name</span>
                    <input
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      data-testid="credential-edit-display-name"
                    />
                  </label>
                  <div style={{ display: "grid", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Update secrets (optional, leave blank to keep)</span>
                    {instance.sourceKind === "db"
                      ? (editingType.secretFields ?? []).map((field) => (
                          <label key={field.key} style={{ display: "grid", gap: 4 }}>
                            <span>{field.label}</span>
                            {field.type === "textarea" ? (
                              <textarea
                                rows={3}
                                value={editSecretFieldValues[field.key] ?? ""}
                                onChange={(e) =>
                                  setEditSecretFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                                }
                                placeholder="Leave blank to keep existing"
                              />
                            ) : (
                              <input
                                type={field.type === "password" ? "password" : "text"}
                                value={editSecretFieldValues[field.key] ?? ""}
                                onChange={(e) =>
                                  setEditSecretFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                                }
                                placeholder="Leave blank to keep existing"
                              />
                            )}
                          </label>
                        ))
                      : (editingType.secretFields ?? []).map((field) => (
                          <label key={field.key} style={{ display: "grid", gap: 4 }}>
                            <span>Env var for {field.label}</span>
                            <input
                              type="text"
                              value={editEnvRefValues[field.key] ?? ""}
                              onChange={(e) =>
                                setEditEnvRefValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              placeholder="Leave blank to keep existing"
                            />
                          </label>
                        ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void updateCredentialInstance()}
                      disabled={isEditSubmitting}
                      style={{ padding: "6px 10px", fontWeight: 700 }}
                    >
                      {isEditSubmitting ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={cancelEdit} style={{ padding: "6px 10px" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{instance.displayName}</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>{instance.typeId}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        data-testid={`credential-instance-edit-button-${instance.instanceId}`}
                        onClick={() => startEdit(instance)}
                        style={{ padding: "6px 10px" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        data-testid={`credential-instance-test-button-${instance.instanceId}`}
                        onClick={() => void testCredentialInstance(instance)}
                        disabled={activeTestInstanceId === instance.instanceId}
                        style={{ padding: "6px 10px", fontWeight: 700 }}
                      >
                        {activeTestInstanceId === instance.instanceId ? "Testing…" : "Test"}
                      </button>
                      <button
                        type="button"
                        data-testid={`credential-instance-delete-button-${instance.instanceId}`}
                        onClick={() => void deleteCredentialInstance(instance.instanceId)}
                        style={{ padding: "6px 10px", color: "#b91c1c" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      fontSize: 12,
                      opacity: 0.78,
                    }}
                  >
                    <span>{instance.sourceKind}</span>
                    <span>{instance.setupStatus}</span>
                    <span>{instance.latestHealth?.status ?? "unknown"}</span>
                  </div>
                  {instance.latestHealth?.message ? (
                    <div style={{ fontSize: 13 }}>{instance.latestHealth.message}</div>
                  ) : null}
                </>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
