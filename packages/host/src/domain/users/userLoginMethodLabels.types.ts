/**
 * Human-readable labels for Better Auth account providers and Codemation-linked identities.
 */
const KNOWN_PROVIDER_LABELS: Readonly<Record<string, string>> = {
  google: "Google",
  github: "GitHub",
  microsoft: "Microsoft Entra ID",
  "azure-ad": "Microsoft Entra ID",
  email: "Email link",
};

function titleCaseProviderId(provider: string): string {
  return provider
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function labelForLinkedAuthAccount(provider: string, accountType: string): string {
  const known = KNOWN_PROVIDER_LABELS[provider];
  if (known) {
    return known;
  }
  if (accountType === "oidc") {
    return `SSO (${titleCaseProviderId(provider)})`;
  }
  return titleCaseProviderId(provider);
}
