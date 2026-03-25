import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the create-codemation package root and template directories from `import.meta.url`.
 */
export class TemplateDirectoryResolver {
  constructor(private readonly importMetaUrl: string) {}

  resolvePackageRoot(): string {
    const sourceDirectory = path.dirname(fileURLToPath(this.importMetaUrl));
    return path.join(sourceDirectory, "..");
  }

  resolveTemplatesRoot(): string {
    return path.join(this.resolvePackageRoot(), "templates");
  }

  resolveTemplateDirectory(templateId: string): string {
    return path.join(this.resolveTemplatesRoot(), templateId);
  }
}
