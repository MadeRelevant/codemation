import type { CredentialOAuth2AuthDefinition } from "@codemation/core";
import { injectable } from "@codemation/core";
import type { JsonRecord } from "./CredentialServices";

@injectable()
export class CredentialOAuth2ScopeResolver {
  resolveRequestedScopes(auth: CredentialOAuth2AuthDefinition, publicConfig: JsonRecord): ReadonlyArray<string> {
    const scopesFromPublicConfig = auth.scopesFromPublicConfig;
    if (!scopesFromPublicConfig) {
      return [...auth.scopes];
    }
    const preset = this.resolveString(publicConfig[scopesFromPublicConfig.presetFieldKey]);
    if (!preset) {
      return [...auth.scopes];
    }
    const presetScopes = scopesFromPublicConfig.presetScopes[preset];
    if (presetScopes) {
      return [...presetScopes];
    }
    const customPresetKey = scopesFromPublicConfig.customPresetKey ?? "custom";
    if (preset !== customPresetKey) {
      return [...auth.scopes];
    }
    const customScopes = this.resolveScopeList(
      publicConfig[scopesFromPublicConfig.customScopesFieldKey ?? "customScopes"],
    );
    if (customScopes.length > 0) {
      return customScopes;
    }
    return [...auth.scopes];
  }

  private resolveString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private resolveScopeList(value: unknown): ReadonlyArray<string> {
    if (Array.isArray(value)) {
      return this.dedupe(
        value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter((entry) => entry.length > 0),
      );
    }
    if (typeof value !== "string") {
      return [];
    }
    return this.dedupe(
      value
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );
  }

  private dedupe(entries: ReadonlyArray<string>): ReadonlyArray<string> {
    return [...new Set(entries)];
  }
}
