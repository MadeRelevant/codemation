import type { ConsumerAgentSkillsSyncService } from "../skills/ConsumerAgentSkillsSyncService";

export class SkillsSyncCommand {
  constructor(private readonly consumerAgentSkillsSyncService: ConsumerAgentSkillsSyncService) {}

  async execute(consumerRoot: string): Promise<void> {
    await this.consumerAgentSkillsSyncService.sync(consumerRoot, { mode: "manual", verbose: true });
  }
}
