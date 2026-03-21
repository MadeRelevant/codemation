


import { Command } from "../bus/Command";






export class DeleteCredentialInstanceCommand extends Command<Readonly<{ ok: true }>> {
  constructor(public readonly instanceId: string) {
    super();
  }
}
