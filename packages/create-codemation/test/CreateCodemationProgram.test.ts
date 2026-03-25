import { describe, expect, it } from "vitest";

import { ConsumerProjectScaffolder } from "../src/ConsumerProjectScaffolder";
import { CreateCodemationProgram } from "../src/CreateCodemationProgram";
import { NodeFileSystem } from "../src/NodeFileSystem";
import { ProjectNameSanitizer } from "../src/ProjectNameSanitizer";
import { TemplateCatalog } from "../src/TemplateCatalog";
import { TemplateDirectoryResolver } from "../src/TemplateDirectoryResolver";
import type { TextOutputPort } from "../src/TextOutputPort";

class MemoryStdout implements TextOutputPort {
  text = "";
  write(chunk: string): void {
    this.text += chunk;
  }
}

describe("CreateCodemationProgram", () => {
  it("prints template ids with --list-templates", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const memory = new MemoryStdout();
    const program = new CreateCodemationProgram(scaffolder, templateCatalog, memory);
    await program.run(["--list-templates"]);
    expect(memory.text).toContain("default");
    expect(memory.text).toContain("minimal");
  });
});
