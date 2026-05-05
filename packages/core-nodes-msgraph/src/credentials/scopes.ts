// Microsoft Graph delegated scope strings.
// Always include offline_access (for token refresh) and User.Read (for /me endpoint used in test()).
const BASE_SCOPES = ["openid", "offline_access", "User.Read"] as const;

export const MAIL_SCOPE_PRESETS = {
  "read-mail": [...BASE_SCOPES, "Mail.Read"],
  "read-write-mail": [...BASE_SCOPES, "Mail.ReadWrite"],
  "send-mail": [...BASE_SCOPES, "Mail.Send"],
  "mail-all": [...BASE_SCOPES, "Mail.ReadWrite", "Mail.Send"],
} as const satisfies Record<string, ReadonlyArray<string>>;

export const DRIVE_SCOPE_PRESETS = {
  "files-read": [...BASE_SCOPES, "Files.Read"],
  "files-readwrite": [...BASE_SCOPES, "Files.ReadWrite"],
  "drive-all": [...BASE_SCOPES, "Files.ReadWrite.All", "Sites.ReadWrite.All"],
} as const satisfies Record<string, ReadonlyArray<string>>;

export type MailScopePreset = keyof typeof MAIL_SCOPE_PRESETS;
export type DriveScopePreset = keyof typeof DRIVE_SCOPE_PRESETS;

export function resolveScopes(
  preset: string,
  customScopes: string,
  presetMap: Readonly<Record<string, ReadonlyArray<string>>>,
  fallbackKey: string,
): ReadonlyArray<string> {
  const presetScopes = presetMap[preset] ?? presetMap[fallbackKey] ?? [];
  if (!customScopes.trim()) {
    return presetScopes;
  }
  const extra = customScopes
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...presetScopes, ...extra])];
}

export function resolveMailScopes(preset: MailScopePreset | string, customScopes: string): ReadonlyArray<string> {
  return resolveScopes(preset, customScopes, MAIL_SCOPE_PRESETS, "read-mail");
}

export function resolveDriveScopes(preset: DriveScopePreset | string, customScopes: string): ReadonlyArray<string> {
  return resolveScopes(preset, customScopes, DRIVE_SCOPE_PRESETS, "files-readwrite");
}
