import type { AgentSkillsExtractorFactory } from "./AgentSkillsExtractorFactory";
import {
  ConsumerAgentSkillsAutoSyncPolicy,
  type ConsumerAgentSkillsSyncRequest,
} from "./ConsumerAgentSkillsAutoSyncPolicy";
import { silentStdout } from "./silentStdout";

/**
 * Syncs packaged Codemation agent skills into `<consumerRoot>/.agents/skills/extracted`.
 * Preserves non-`codemation-*` directories under `extracted` per the packaged extractor behavior.
 */
export class ConsumerAgentSkillsSyncService {
  constructor(
    private readonly agentSkillsExtractorFactory: AgentSkillsExtractorFactory,
    private readonly autoSyncPolicy: ConsumerAgentSkillsAutoSyncPolicy,
  ) {}

  async sync(consumerRoot: string, options: ConsumerAgentSkillsSyncRequest = {}): Promise<void> {
    if (!(await this.autoSyncPolicy.shouldSync(consumerRoot, options))) {
      return;
    }
    const verbose = options.verbose === true;
    const stdout = verbose ? process.stdout : silentStdout;
    const extractor = this.agentSkillsExtractorFactory.create(consumerRoot, stdout);
    await extractor.extract(".agents/skills/extracted");
  }
}
