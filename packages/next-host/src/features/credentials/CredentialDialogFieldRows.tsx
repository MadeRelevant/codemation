"use client";

import type { CredentialFieldSchema } from "@codemation/core/browser";
import type { Dispatch, SetStateAction } from "react";
import { maskedDisplayValue } from "./credentialFieldHelpers";

export type CredentialDialogOrderedField =
  | { kind: "public"; field: CredentialFieldSchema; order: number }
  | { kind: "secret"; field: CredentialFieldSchema; order: number };

export type CredentialDialogFieldRowsProps = {
  orderedFields: ReadonlyArray<CredentialDialogOrderedField>;
  publicFieldValues: Record<string, string>;
  setPublicFieldValues: Dispatch<SetStateAction<Record<string, string>>>;
  secretFieldValues: Record<string, string>;
  setSecretFieldValues: Dispatch<SetStateAction<Record<string, string>>>;
  envRefValues: Record<string, string>;
  setEnvRefValues: Dispatch<SetStateAction<Record<string, string>>>;
  isEdit: boolean;
  isDbSecretSource: boolean;
  showSecrets: boolean;
};

export function CredentialDialogFieldRows({
  orderedFields,
  publicFieldValues,
  setPublicFieldValues,
  secretFieldValues,
  setSecretFieldValues,
  envRefValues,
  setEnvRefValues,
  isEdit,
  isDbSecretSource,
  showSecrets,
}: CredentialDialogFieldRowsProps) {
  return (
    <>
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
              {field.helpText && <span className="credential-dialog__help">{field.helpText}</span>}
              {isEdit && <span className="credential-dialog__help">Leave blank to keep existing value</span>}
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
              placeholder={isEdit ? undefined : field.placeholder ?? `e.g. GMAIL_${field.key.toUpperCase()}`}
            />
            {field.helpText && <span className="credential-dialog__help">{field.helpText}</span>}
            {isEdit && <span className="credential-dialog__help">Leave blank to keep existing value</span>}
          </label>
        );
      })}
    </>
  );
}
