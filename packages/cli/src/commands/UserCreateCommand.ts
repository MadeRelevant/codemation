import path from "node:path";
import process from "node:process";

import { LocalUserCreator, type LocalUserCreateOptions } from "../user/LocalUserCreator";

export class UserCreateCommand {
  constructor(private readonly localUserCreator: LocalUserCreator) {}

  async execute(
    opts: Readonly<{
      email: string;
      password: string;
      consumerRoot?: string;
      config?: string;
    }>,
  ): Promise<void> {
    const options: LocalUserCreateOptions = {
      consumerRoot:
        opts.consumerRoot !== undefined && opts.consumerRoot.trim().length > 0
          ? path.resolve(process.cwd(), opts.consumerRoot.trim())
          : undefined,
      configPath: opts.config && opts.config.trim().length > 0 ? opts.config.trim() : undefined,
      email: opts.email,
      password: opts.password,
    };
    await this.localUserCreator.run(options);
  }
}
