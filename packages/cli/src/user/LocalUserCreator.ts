import { UpsertLocalBootstrapUserCommand } from "@codemation/host";
import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";

import type { UserAdminCliBootstrap, UserAdminCliOptions } from "./UserAdminCliBootstrap";

export type LocalUserCreateOptions = Readonly<
  UserAdminCliOptions & {
    email: string;
    password: string;
  }
>;

export class LocalUserCreator {
  private readonly log = new ServerLoggerFactory(logLevelPolicyFactory).create("codemation-cli.user");

  constructor(private readonly userAdminBootstrap: UserAdminCliBootstrap) {}

  async run(options: LocalUserCreateOptions): Promise<void> {
    const email = options.email;
    const password = options.password;
    await this.userAdminBootstrap.withSession(
      { consumerRoot: options.consumerRoot, configPath: options.configPath },
      async (session) => {
        const result = await session.getCommandBus().execute(new UpsertLocalBootstrapUserCommand(email, password));
        this.log.info(result.outcome === "created" ? `Created local user: ${email}` : `Updated local user: ${email}`);
      },
    );
  }
}
