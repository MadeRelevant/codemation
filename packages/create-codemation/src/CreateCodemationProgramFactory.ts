import { ConsumerProjectScaffolder } from "./ConsumerProjectScaffolder";
import { CreateCodemationProgram } from "./CreateCodemationProgram";
import { NodeFileSystem } from "./NodeFileSystem";
import { ProcessStdout } from "./ProcessStdout";
import { ProjectNameSanitizer } from "./ProjectNameSanitizer";
import { TemplateCatalog } from "./TemplateCatalog";
import { TemplateDirectoryResolver } from "./TemplateDirectoryResolver";

export class CreateCodemationProgramFactory {
  constructor(private readonly importMetaUrl: string) {}

  create(): CreateCodemationProgram {
    const resolver = new TemplateDirectoryResolver(this.importMetaUrl);
    const fs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, fs);
    const projectNameSanitizer = new ProjectNameSanitizer();
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, projectNameSanitizer, fs);
    return new CreateCodemationProgram(scaffolder, templateCatalog, new ProcessStdout());
  }
}
