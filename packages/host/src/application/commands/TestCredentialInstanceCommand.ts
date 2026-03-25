import type { CredentialHealth } from "@codemation/core";

import { Command } from "../bus/Command";

export class TestCredentialInstanceCommand extends Command<CredentialHealth> {
  constructor(public readonly instanceId: string) {
    super();
  }
}
