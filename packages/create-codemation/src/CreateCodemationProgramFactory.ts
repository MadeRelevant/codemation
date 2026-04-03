import process from "node:process";

import { AgentSkillsDirectoryResolver } from "./AgentSkillsDirectoryResolver";
import { ConsumerProjectScaffolder } from "./ConsumerProjectScaffolder";
import { CreateCodemationProgram } from "./CreateCodemationProgram";
import { NodeChildProcessRunner } from "./NodeChildProcessRunner";
import { NodeFileSystem } from "./NodeFileSystem";
import { NodeInteractivePrompt } from "./NodeInteractivePrompt";
import { PostScaffoldOnboardingCoordinator } from "./PostScaffoldOnboardingCoordinator";
import { ProcessStdout } from "./ProcessStdout";
import { ProjectNameSanitizer } from "./ProjectNameSanitizer";
import { TemplateCatalog } from "./TemplateCatalog";
import { TemplateDirectoryResolver } from "./TemplateDirectoryResolver";

export class CreateCodemationProgramFactory {
  constructor(private readonly importMetaUrl: string) {}

  create(): CreateCodemationProgram {
    const resolver = new TemplateDirectoryResolver(this.importMetaUrl);
    const agentSkillsDirectoryResolver = new AgentSkillsDirectoryResolver(this.importMetaUrl);
    const fs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, fs);
    const projectNameSanitizer = new ProjectNameSanitizer();
    const scaffolder = new ConsumerProjectScaffolder(
      resolver,
      agentSkillsDirectoryResolver,
      templateCatalog,
      projectNameSanitizer,
      fs,
    );
    const stdout = new ProcessStdout();
    const onboarding = new PostScaffoldOnboardingCoordinator(
      stdout,
      new NodeInteractivePrompt(process.stdin, process.stdout),
      fs,
      new NodeChildProcessRunner(),
      process.stdin.isTTY === true,
    );
    return new CreateCodemationProgram(scaffolder, templateCatalog, stdout, onboarding);
  }
}
