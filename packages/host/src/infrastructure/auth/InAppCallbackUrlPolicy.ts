/**
 * Restricts post-login navigation targets to same-origin relative paths (no open redirects).
 */
export class InAppCallbackUrlPolicy {
  private static readonly fallbackPath = "/";

  resolveSafeRelativeCallbackUrl(raw: string | undefined | null): string {
    if (raw === undefined || raw === null) {
      return InAppCallbackUrlPolicy.fallbackPath;
    }
    if (this.containsAsciiControl(raw)) {
      return InAppCallbackUrlPolicy.fallbackPath;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return InAppCallbackUrlPolicy.fallbackPath;
    }
    if (!trimmed.startsWith("/")) {
      return InAppCallbackUrlPolicy.fallbackPath;
    }
    if (trimmed.startsWith("//")) {
      return InAppCallbackUrlPolicy.fallbackPath;
    }
    if (trimmed.includes("\\")) {
      return InAppCallbackUrlPolicy.fallbackPath;
    }
    return trimmed;
  }

  private containsAsciiControl(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code <= 0x1f || code === 0x7f) {
        return true;
      }
    }
    return false;
  }
}
