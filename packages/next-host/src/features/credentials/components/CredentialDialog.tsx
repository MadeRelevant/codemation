"use client";

import type { CredentialFieldSchema, CredentialTypeDefinition } from "@codemation/core/browser";
import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { CodemationDialog } from "@/components/CodemationDialog";
import type { CredentialInstanceDto } from "../../workflows/hooks/realtime/realtime";
import type { FormSourceKind } from "../lib/credentialFormTypes";
import { CredentialDialogFeedback } from "./CredentialDialogFeedback";
import { CredentialDialogFieldRows } from "./CredentialDialogFieldRows";
import { CredentialDialogFormSections } from "./CredentialDialogFormSections";

export type CredentialDialogProps = {
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
  setPublicFieldValues: Dispatch<SetStateAction<Record<string, string>>>;
  secretFieldValues: Record<string, string>;
  setSecretFieldValues: Dispatch<SetStateAction<Record<string, string>>>;
  envRefValues: Record<string, string>;
  setEnvRefValues: Dispatch<SetStateAction<Record<string, string>>>;
  showSecrets: boolean;
  setShowSecrets: Dispatch<SetStateAction<boolean>>;
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
};

export function CredentialDialog({
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
  const activeType =
    mode === "edit" && editingInstance
      ? credentialTypes.find((t) => t.typeId === editingInstance.typeId)
      : selectedType;
  const publicFields = (activeType?.publicFields ?? []) as ReadonlyArray<CredentialFieldSchema>;
  const secretFields = (activeType?.secretFields ?? []) as ReadonlyArray<CredentialFieldSchema>;
  const isOAuth2Type = activeType?.auth?.kind === "oauth2";
  const orderedFields = [
    ...publicFields.map((field, index) => ({
      kind: "public" as const,
      field,
      order: field.order ?? index,
    })),
    ...secretFields.map((field, index) => ({
      kind: "secret" as const,
      field,
      order: field.order ?? publicFields.length + index,
    })),
  ].sort((left, right) => left.order - right.order);

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

  return (
    <CodemationDialog onClose={onClose} testId="credential-dialog" size="wide">
      <CodemationDialog.Title>{isEdit ? "Edit credential" : "Add credential"}</CodemationDialog.Title>
      <CodemationDialog.Content>
        <CredentialDialogFormSections
          credentialTypes={credentialTypes}
          typesLoading={typesLoading}
          typesError={typesError}
          typesEmpty={typesEmpty}
          selectedTypeId={selectedTypeId}
          setSelectedTypeId={setSelectedTypeId}
          displayName={displayName}
          setDisplayName={setDisplayName}
          sourceKind={sourceKind}
          setSourceKind={setSourceKind}
          isEdit={isEdit}
          isTypeLocked={isTypeLocked}
          canToggleSecrets={canToggleSecrets}
          showSecrets={showSecrets}
          setShowSecrets={setShowSecrets}
          secretsLoading={secretsLoading}
          isOAuth2Type={isOAuth2Type}
          oauth2RedirectUri={oauth2RedirectUri}
          isLoadingOauth2RedirectUri={isLoadingOauth2RedirectUri}
          editingInstance={editingInstance}
          canSubmit={canSubmit}
          onConnectOAuth2={onConnectOAuth2}
          onDisconnectOAuth2={onDisconnectOAuth2}
        />
        <CredentialDialogFieldRows
          orderedFields={orderedFields}
          publicFieldValues={publicFieldValues}
          setPublicFieldValues={setPublicFieldValues}
          secretFieldValues={secretFieldValues}
          setSecretFieldValues={setSecretFieldValues}
          envRefValues={envRefValues}
          setEnvRefValues={setEnvRefValues}
          isEdit={isEdit}
          isDbSecretSource={isDbSecretSource}
          showSecrets={showSecrets}
        />
        <CredentialDialogFeedback errorMessage={errorMessage} dialogTestResult={dialogTestResult} />
      </CodemationDialog.Content>
      <CodemationDialog.Actions>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          data-testid="credential-test-button"
          disabled={!canTest}
          onClick={() => void onTest()}
        >
          {isDialogTesting ? "Testing…" : "Test"}
        </Button>
        <Button
          type="button"
          data-testid={isEdit ? "credential-save-button" : "credential-create-button"}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {isSubmitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
        </Button>
      </CodemationDialog.Actions>
    </CodemationDialog>
  );
}
