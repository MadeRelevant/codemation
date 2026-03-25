import path from "node:path";

/**
 * Produces a valid npm package name segment from a target directory path.
 */
export class ProjectNameSanitizer {
  sanitizeFromTargetPath(targetDirectory: string): string {
    const base = path.basename(path.resolve(targetDirectory));
    if (base === "." || base === "..") {
      return "codemation-app";
    }
    const lowered = base.toLowerCase().replace(/[^a-z0-9-_.]/g, "-");
    const trimmed = lowered.replace(/^[-_.]+/g, "").replace(/[-_.]+$/g, "");
    const cleaned = trimmed.length > 0 ? trimmed : "codemation-app";
    if (cleaned.startsWith(".") || cleaned.startsWith("_")) {
      const stripped = cleaned.replace(/^[._]+/, "");
      return stripped.length > 0 ? stripped : "codemation-app";
    }
    return cleaned;
  }
}
