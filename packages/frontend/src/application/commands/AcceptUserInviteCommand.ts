

import { Command } from "../bus/Command";






export class AcceptUserInviteCommand extends Command<void> {
  constructor(
    public readonly token: string,
    public readonly password: string,
  ) {
    super();
  }
}
