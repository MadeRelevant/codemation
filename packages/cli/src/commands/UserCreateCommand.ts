import { LocalUserCreator, type LocalUserCreateOptions } from "../user/LocalUserCreator";
import type { UserAdminCliOptionsParser } from "../user/UserAdminCliOptionsParser";

export class UserCreateCommand {
  constructor(
    private readonly localUserCreator: LocalUserCreator,
    private readonly userAdminCliOptionsParser: UserAdminCliOptionsParser,
  ) {}

  async execute(
    opts: Readonly<{
      email: string;
      password: string;
      consumerRoot?: string;
      config?: string;
    }>,
  ): Promise<void> {
    const options: LocalUserCreateOptions = {
      ...this.userAdminCliOptionsParser.parse(opts),
      email: opts.email,
      password: opts.password,
    };
    await this.localUserCreator.run(options);
  }
}
