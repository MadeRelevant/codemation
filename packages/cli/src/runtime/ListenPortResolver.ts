/**
 * Shared HTTP listen port parsing for CLI commands (dev server, serve web, etc.).
 */
export class ListenPortResolver {
  resolvePrimaryApplicationPort(rawPort: string | undefined): number {
    const parsedPort = Number(rawPort);
    if (Number.isInteger(parsedPort) && parsedPort > 0) {
      return parsedPort;
    }
    return 3000;
  }

  parsePositiveInteger(raw: string | undefined): number | null {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    return null;
  }

  resolveWebsocketPortRelativeToHttp(
    args: Readonly<{
      nextPort: number;
      publicWebsocketPort: string | undefined;
      websocketPort: string | undefined;
    }>,
  ): number {
    const explicit =
      this.parsePositiveInteger(args.publicWebsocketPort) ?? this.parsePositiveInteger(args.websocketPort);
    if (explicit !== null) {
      return explicit;
    }
    return args.nextPort + 1;
  }
}
