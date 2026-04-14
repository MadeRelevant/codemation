import { FileSystemGateway, SkillExtractor, resolveAgentSkillsPackageRoot } from "@codemation/agent-skills";

/**
 * Creates {@link SkillExtractor} instances wired to the installed `@codemation/agent-skills` package.
 */
export class AgentSkillsExtractorFactory {
  create(consumerRoot: string, stdout: { write: (chunk: string) => void }): SkillExtractor {
    return new SkillExtractor(new FileSystemGateway(), resolveAgentSkillsPackageRoot(), consumerRoot, stdout);
  }
}
