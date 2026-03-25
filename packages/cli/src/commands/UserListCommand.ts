import { ListUserAccountsQuery } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";
import type { CliDatabaseUrlDescriptor } from "../user/CliDatabaseUrlDescriptor";
import type { UserAdminCliBootstrap } from "../user/UserAdminCliBootstrap";
import type { UserAdminCliCommandOptionsRaw, UserAdminCliOptionsParser } from "../user/UserAdminCliOptionsParser";

type UserRowForTable = Readonly<{
  email: string;
  status: string;
  id: string;
  loginMethods: ReadonlyArray<string>;
}>;

export class UserListCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly userAdminBootstrap: UserAdminCliBootstrap,
    private readonly databaseUrlDescriptor: CliDatabaseUrlDescriptor,
    private readonly userAdminCliOptionsParser: UserAdminCliOptionsParser,
  ) {}

  async execute(opts: UserAdminCliCommandOptionsRaw): Promise<void> {
    await this.userAdminBootstrap.withSession(this.userAdminCliOptionsParser.parse(opts), async (session) => {
      const where = this.databaseUrlDescriptor.describeForDisplay(process.env.DATABASE_URL);
      const users = await session.getQueryBus().execute(new ListUserAccountsQuery());
      if (users.length === 0) {
        this.cliLogger.info(
          `No users found (${where}). If this is the wrong database, fix DATABASE_URL or CodemationConfig.runtime.database.url.`,
        );
        return;
      }
      this.cliLogger.info(`${where}\n${this.formatUserAccountsTable(users)}`);
    });
  }

  private formatUserAccountsTable(users: ReadonlyArray<UserRowForTable>): string {
    const headers = ["Email", "Status", "Id", "Login methods"] as const;
    const rows: ReadonlyArray<ReadonlyArray<string>> = users.map((user) => [
      user.email,
      user.status,
      user.id,
      user.loginMethods.length > 0 ? user.loginMethods.join(", ") : "—",
    ]);
    const columnCount = headers.length;
    const widths: number[] = [];
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const headerWidth = headers[columnIndex].length;
      const cellWidths = rows.map((row) => row[columnIndex].length);
      widths.push(Math.max(headerWidth, ...cellWidths, 3));
    }
    const padCell = (text: string, columnIndex: number): string => text.padEnd(widths[columnIndex] ?? text.length);
    const horizontal = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
    const formatRow = (cells: ReadonlyArray<string>): string =>
      `| ${cells.map((cell, index) => padCell(cell, index)).join(" | ")} |`;
    const headerLine = formatRow([...headers]);
    const bodyLines = rows.map((row) => formatRow([...row]));
    return [horizontal, headerLine, horizontal, ...bodyLines, horizontal].join("\n");
  }
}
