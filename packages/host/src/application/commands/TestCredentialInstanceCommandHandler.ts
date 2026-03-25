import type { CredentialHealth } from "@codemation/core";

import { inject } from "@codemation/core";

import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";

import { TestCredentialInstanceCommand } from "./TestCredentialInstanceCommand";

import { CredentialTestService } from "../../domain/credentials/CredentialServices";

@HandlesCommand.forCommand(TestCredentialInstanceCommand)
export class TestCredentialInstanceCommandHandler extends CommandHandler<
  TestCredentialInstanceCommand,
  CredentialHealth
> {
  constructor(
    @inject(CredentialTestService)
    private readonly credentialTestService: CredentialTestService,
  ) {
    super();
  }

  async execute(command: TestCredentialInstanceCommand): Promise<CredentialHealth> {
    return await this.credentialTestService.test(command.instanceId);
  }
}
