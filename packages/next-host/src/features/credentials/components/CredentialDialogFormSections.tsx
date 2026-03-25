"use client";

import type { CredentialTypeDefinition } from "@codemation/core/browser";
import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CredentialInstanceDto } from "../../workflows/hooks/realtime/realtime";
import type { FormSourceKind } from "../lib/credentialFormTypes";

const TYPE_PLACEHOLDER = "__none__";

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
      <div className="flex flex-col gap-2">
        <Label htmlFor="credential-type-select">Credential type</Label>
        <Select
          value={selectedTypeId || TYPE_PLACEHOLDER}
          onValueChange={(v) => setSelectedTypeId(v === TYPE_PLACEHOLDER ? "" : v)}
          disabled={typesLoading || isTypeLocked}
        >
          <SelectTrigger id="credential-type-select" className="w-full" data-testid="credential-type-select">
            <SelectValue placeholder="Select a credential type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TYPE_PLACEHOLDER}>Select a credential type</SelectItem>
            {credentialTypes.map((type) => (
              <SelectItem key={type.typeId} value={type.typeId}>
                {type.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {typesLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
        {typesError && <span className="text-sm text-destructive">Failed to load credential types.</span>}
        {!typesLoading && !typesError && typesEmpty && (
          <span className="text-xs text-muted-foreground">No credential types available.</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="credential-display-name">Display name</Label>
        <Input
          id="credential-display-name"
          type="text"
          data-testid="credential-display-name-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. My Gmail account"
        />
      </div>

      {!isEdit && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="credential-source-kind">Secret source</Label>
          <Select value={sourceKind} onValueChange={(v) => setSourceKind(v as FormSourceKind)}>
            <SelectTrigger id="credential-source-kind" className="w-full" data-testid="credential-source-kind-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="db">Store secret in database</SelectItem>
              <SelectItem value="env">Load from environment variables</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {canToggleSecrets && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setShowSecrets((s) => !s)}
            data-testid="credential-show-secrets-toggle"
            disabled={isEdit && secretsLoading}
          >
            {showSecrets ? "Hide" : "Show"} values
          </Button>
          {isEdit && secretsLoading && <span className="text-xs text-muted-foreground">Loading credential…</span>}
        </div>
      )}

      {isOAuth2Type && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium leading-none">OAuth2 connection</span>
          {isLoadingOauth2RedirectUri ? (
            <span className="text-xs text-muted-foreground">Loading redirect URI…</span>
          ) : (
            <>
              <Input data-testid="credential-oauth2-redirect-uri" type="text" readOnly value={oauth2RedirectUri} />
              <span className="text-xs text-muted-foreground">
                Configure this redirect URI in your OAuth client before connecting.
              </span>
            </>
          )}
          {isEdit && editingInstance?.oauth2Connection?.status === "connected" && (
            <span className="text-xs text-muted-foreground" data-testid="credential-oauth2-connected-status">
              Connected
              {editingInstance.oauth2Connection.connectedEmail
                ? ` as ${editingInstance.oauth2Connection.connectedEmail}`
                : ""}
            </span>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="credential-oauth2-connect-button"
              onClick={() => void onConnectOAuth2()}
              disabled={!isEdit && !canSubmit}
            >
              {isEdit
                ? editingInstance?.oauth2Connection?.status === "connected"
                  ? "Reconnect"
                  : "Connect"
                : "Create and connect"}
            </Button>
            {isEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="credential-oauth2-disconnect-button"
                onClick={() => void onDisconnectOAuth2()}
                disabled={editingInstance?.oauth2Connection?.status !== "connected"}
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
