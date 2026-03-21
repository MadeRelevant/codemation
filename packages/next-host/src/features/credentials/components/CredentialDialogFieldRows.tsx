"use client";

import type { CredentialFieldSchema } from "@codemation/core/browser";
import type { Dispatch, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { maskedDisplayValue } from "../lib/credentialFieldHelpers";

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
          const id = `credential-public-${field.key}`;
          return (
            <div key={`public-${field.key}`} className="flex flex-col gap-2">
              <Label htmlFor={id}>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={id}
                  data-testid={`credential-public-${field.key}`}
                  rows={4}
                  value={publicFieldValues[field.key] ?? ""}
                  onChange={(e) =>
                    setPublicFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                />
              ) : (
                <Input
                  id={id}
                  data-testid={`credential-public-${field.key}`}
                  type={field.type === "password" ? "password" : "text"}
                  value={publicFieldValues[field.key] ?? ""}
                  onChange={(e) =>
                    setPublicFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                />
              )}
              {field.helpText && (
                <span className="text-xs text-muted-foreground">{field.helpText}</span>
              )}
            </div>
          );
        }
        if (isDbSecretSource) {
          const raw = secretFieldValues[field.key] ?? "";
          const isMasked = isEdit && field.type === "password" && !showSecrets && raw.length > 0;
          const displayValue = isMasked ? maskedDisplayValue() : raw;
          const id = `credential-secret-${field.key}`;
          return (
            <div key={`secret-${field.key}`} className="flex flex-col gap-2">
              <Label htmlFor={id}>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={id}
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
                <Input
                  id={id}
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
                <span className="text-xs text-muted-foreground">{field.helpText}</span>
              )}
              {isEdit && (
                <span className="text-xs text-muted-foreground">Leave blank to keep existing value</span>
              )}
            </div>
          );
        }
        const displayEnv = envRefValues[field.key] ?? "";
        const id = `credential-env-${field.key}`;
        return (
          <div key={`env-${field.key}`} className="flex flex-col gap-2">
            <Label htmlFor={id}>
              Env var for {field.label}
              {field.required ? " *" : ""}
            </Label>
            <Input
              id={id}
              data-testid={`credential-env-${field.key}`}
              type="text"
              value={displayEnv}
              onChange={(e) =>
                setEnvRefValues((prev) => ({ ...prev, [field.key]: e.target.value }))
              }
              placeholder={isEdit ? undefined : field.placeholder ?? `e.g. GMAIL_${field.key.toUpperCase()}`}
            />
            {field.helpText && (
              <span className="text-xs text-muted-foreground">{field.helpText}</span>
            )}
            {isEdit && (
              <span className="text-xs text-muted-foreground">Leave blank to keep existing value</span>
            )}
          </div>
        );
      })}
    </>
  );
}
