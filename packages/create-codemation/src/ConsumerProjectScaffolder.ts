import path from "node:path";

import type { FileSystemPort } from "./FileSystemPort";
import type { ProjectNameSanitizer } from "./ProjectNameSanitizer";
import type { TemplateCatalog } from "./TemplateCatalog";
import type { TemplateDirectoryResolver } from "./TemplateDirectoryResolver";

export class ConsumerProjectScaffolder {
  constructor(
    private readonly resolver: TemplateDirectoryResolver,
    private readonly templateCatalog: TemplateCatalog,
    private readonly projectNameSanitizer: ProjectNameSanitizer,
    private readonly fs: FileSystemPort,
  ) {}

  async scaffold(args: Readonly<{ templateId: string; targetDirectory: string; force: boolean }>): Promise<void> {
    await this.templateCatalog.assertTemplateExists(args.templateId);
    const templateDirectory = this.resolver.resolveTemplateDirectory(args.templateId);
    const resolvedTarget = path.resolve(args.targetDirectory);
    await this.ensureTargetIsUsable(resolvedTarget, args.force);
    await this.fs.mkdir(resolvedTarget, { recursive: true });
    await this.fs.cp(templateDirectory, resolvedTarget, { recursive: true, force: true });
    const projectName = this.projectNameSanitizer.sanitizeFromTargetPath(resolvedTarget);
    await this.applyPackageName(resolvedTarget, projectName);
  }

  private async ensureTargetIsUsable(resolvedTarget: string, force: boolean): Promise<void> {
    let entries: string[];
    try {
      entries = await this.fs.readdir(resolvedTarget);
    } catch {
      return;
    }
    const visible = entries.filter((e) => !e.startsWith("."));
    if (visible.length > 0 && !force) {
      throw new Error(
        `Target directory is not empty: ${resolvedTarget}. Pass --force to write anyway (overwrites matching files).`,
      );
    }
  }

  private async applyPackageName(projectRoot: string, projectName: string): Promise<void> {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const raw = await this.fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { name?: string };
    parsed.name = projectName;
    await this.fs.writeFile(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
  }
}
