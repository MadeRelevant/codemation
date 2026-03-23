import type { CredentialFieldSchema } from "@codemation/core/browser";

export function maskedDisplayValue(): string {
  return "••••••••••••";
}

export function buildEmptySecretFieldValues(fields: ReadonlyArray<CredentialFieldSchema>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    out[f.key] = "";
  }
  return out;
}

export function buildFieldStringValues(
  fields: ReadonlyArray<CredentialFieldSchema>,
  source?: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    out[field.key] = String(source?.[field.key] ?? "");
  }
  return out;
}

export function isCredentialFieldLockedByEnv(
  field: CredentialFieldSchema,
  envStatus: Readonly<Record<string, boolean>>,
): boolean {
  const name = field.envVarName?.trim();
  if (!name) {
    return false;
  }
  return envStatus[name] === true;
}
