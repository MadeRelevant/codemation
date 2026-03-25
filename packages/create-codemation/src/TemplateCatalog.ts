import path from "node:path";

import type { FileSystemPort } from "./FileSystemPort";
import type { TemplateDirectoryResolver } from "./TemplateDirectoryResolver";

/**
 * Lists template ids (subdirectories of `templates/`).
 */
export class TemplateCatalog {
  constructor(
    private readonly resolver: TemplateDirectoryResolver,
    private readonly fs: FileSystemPort,
  ) {}

  async listTemplateIds(): Promise<string[]> {
    const root = this.resolver.resolveTemplatesRoot();
    const entries = await this.fs.readdir(root);
    const ids: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith(".")) {
        continue;
      }
      const candidate = path.join(root, entry);
      const stat = await this.fs.stat(candidate);
      if (stat.isDirectory()) {
        ids.push(entry);
      }
    }
    return ids.sort((a, b) => a.localeCompare(b));
  }

  async assertTemplateExists(templateId: string): Promise<void> {
    const dir = this.resolver.resolveTemplateDirectory(templateId);
    try {
      const stat = await this.fs.stat(dir);
      if (!stat.isDirectory()) {
        throw new Error(`Template "${templateId}" is not a directory.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("not a directory")) {
        throw error;
      }
      if (this.readNodeErrorCode(error) !== "ENOENT") {
        throw error;
      }
      const available = await this.listTemplateIds();
      throw new Error(
        `Unknown template "${templateId}". Available: ${available.length > 0 ? available.join(", ") : "(none)"}.`,
        { cause: error },
      );
    }
  }

  private readNodeErrorCode(error: unknown): string | undefined {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as { readonly code?: unknown }).code;
      return typeof code === "string" ? code : undefined;
    }
    return undefined;
  }
}
