"use client";

import type { CredentialTypeDefinition } from "@codemation/core/browser";
import type { Dispatch, SetStateAction } from "react";
import type { CredentialInstanceDto } from "../../workflows/hooks/realtime/realtime";
import type { FormSourceKind } from "../lib/credentialFormTypes";

export type CredentialDialogFormSectionsProps = {
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
  isEdit: boolean;
  isTypeLocked: boolean;
  canToggleSecrets: boolean;
  showSecrets: boolean;
  setShowSecrets: Dispatch<SetStateAction<boolean>>;
  secretsLoading: boolean;
  isOAuth2Type: boolean;
  oauth2RedirectUri: string;
  isLoadingOauth2RedirectUri: boolean;
  editingInstance: CredentialInstanceDto | null | undefined;
  canSubmit: boolean;
  onConnectOAuth2: () => Promise<void>;
  onDisconnectOAuth2: () => void;
};

export function CredentialDialogFormSections({
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
  isEdit,
  isTypeLocked,
  canToggleSecrets,
  showSecrets,
  setShowSecrets,
  secretsLoading,
  isOAuth2Type,
  oauth2RedirectUri,
  isLoadingOauth2RedirectUri,
  editingInstance,
  canSubmit,
  onConnectOAuth2,
  onDisconnectOAuth2,
}: CredentialDialogFormSectionsProps) {
  return (
    <>
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
        {typesError && <span className="credential-dialog__error">Failed to load credential types.</span>}
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
          {isEdit && secretsLoading && <span className="credential-dialog__help">Loading credential…</span>}
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
                ? editingInstance?.oauth2Connection?.status === "connected"
                  ? "Reconnect"
                  : "Connect"
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
    </>
  );
}
