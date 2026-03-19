import type { CredentialBinding, CredentialHealth } from "@codemation/core";
import { inject } from "@codemation/core";
import type {
  CreateCredentialInstanceRequest,
  CredentialInstanceDto,
  UpdateCredentialInstanceRequest,
  UpsertCredentialBindingRequest,
} from "../contracts/CredentialContracts";
import { Command } from "../bus/Command";
import { CommandHandler } from "../bus/CommandHandler";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import {
  CredentialBindingService,
  CredentialInstanceService,
  CredentialTestService,
} from "../../domain/credentials/CredentialServices";

export class CreateCredentialInstanceCommand extends Command<CredentialInstanceDto> {
  constructor(public readonly body: CreateCredentialInstanceRequest) {
    super();
  }
}

export class UpdateCredentialInstanceCommand extends Command<CredentialInstanceDto> {
  constructor(
    public readonly instanceId: string,
    public readonly body: UpdateCredentialInstanceRequest,
  ) {
    super();
  }
}

export class UpsertCredentialBindingCommand extends Command<CredentialBinding> {
  constructor(public readonly body: UpsertCredentialBindingRequest) {
    super();
  }
}

export class TestCredentialInstanceCommand extends Command<CredentialHealth> {
  constructor(public readonly instanceId: string) {
    super();
  }
}

export class DeleteCredentialInstanceCommand extends Command<Readonly<{ ok: true }>> {
  constructor(public readonly instanceId: string) {
    super();
  }
}

@HandlesCommand.for(CreateCredentialInstanceCommand)
export class CreateCredentialInstanceCommandHandler extends CommandHandler<CreateCredentialInstanceCommand, CredentialInstanceDto> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {
    super();
  }

  async execute(command: CreateCredentialInstanceCommand): Promise<CredentialInstanceDto> {
    return await this.credentialInstanceService.create(command.body);
  }
}

@HandlesCommand.for(UpdateCredentialInstanceCommand)
export class UpdateCredentialInstanceCommandHandler extends CommandHandler<UpdateCredentialInstanceCommand, CredentialInstanceDto> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {
    super();
  }

  async execute(command: UpdateCredentialInstanceCommand): Promise<CredentialInstanceDto> {
    return await this.credentialInstanceService.update(command.instanceId, command.body);
  }
}

@HandlesCommand.for(UpsertCredentialBindingCommand)
export class UpsertCredentialBindingCommandHandler extends CommandHandler<UpsertCredentialBindingCommand, CredentialBinding> {
  constructor(
    @inject(CredentialBindingService)
    private readonly credentialBindingService: CredentialBindingService,
  ) {
    super();
  }

  async execute(command: UpsertCredentialBindingCommand): Promise<CredentialBinding> {
    return await this.credentialBindingService.upsertBinding(command.body);
  }
}

@HandlesCommand.for(TestCredentialInstanceCommand)
export class TestCredentialInstanceCommandHandler extends CommandHandler<TestCredentialInstanceCommand, CredentialHealth> {
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

@HandlesCommand.for(DeleteCredentialInstanceCommand)
export class DeleteCredentialInstanceCommandHandler extends CommandHandler<DeleteCredentialInstanceCommand, Readonly<{ ok: true }>> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {
    super();
  }

  async execute(command: DeleteCredentialInstanceCommand): Promise<Readonly<{ ok: true }>> {
    await this.credentialInstanceService.delete(command.instanceId);
    return { ok: true };
  }
}
