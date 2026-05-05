// Microsoft Graph delegated scope strings.
// Always include offline_access (for token refresh) and User.Read (for /me endpoint used in test()).
const BASE_SCOPES = ["openid", "offline_access", "User.Read"] as const;

export const SCOPE_PRESETS = {
  "read-mail": [...BASE_SCOPES, "Mail.Read"],
  "read-write-mail": [...BASE_SCOPES, "Mail.ReadWrite"],
  "send-mail": [...BASE_SCOPES, "Mail.Send"],
  "files-read": [...BASE_SCOPES, "Files.Read"],
  "files-readwrite": [...BASE_SCOPES, "Files.ReadWrite"],
  /**
   * All-in-one preset covering Outlook, OneDrive/SharePoint, and Excel.
   * Use this when a single credential needs to perform actions across all three families
   * (the recommended operating model for multi-step automations).
   */
  "graph-all": [...BASE_SCOPES, "Mail.ReadWrite", "Mail.Send", "Files.ReadWrite.All", "Sites.ReadWrite.All"],
} as const satisfies Record<string, ReadonlyArray<string>>;

export type ScopePreset = keyof typeof SCOPE_PRESETS;

export function resolveScopes(preset: ScopePreset, customScopes: string): ReadonlyArray<string> {
  const presetScopes = SCOPE_PRESETS[preset] ?? SCOPE_PRESETS["read-mail"];
  if (!customScopes.trim()) {
    return presetScopes;
  }
  const extra = customScopes
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...presetScopes, ...extra])];
}
