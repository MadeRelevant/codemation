/**
 * Resolves the TCP port browsers must use for workflow WebSockets in dev.
 * The UI is served from Next (e.g. :3000) but WS upgrades are handled by the Codemation dev gateway;
 * connecting to `window.location.port` targets Next and fails (reconnect storm + slow dev experience).
 */
export class CodemationWebsocketPublicPortReader {
  read(): string | undefined {
    const explicit =
      process.env.CODEMATION_PUBLIC_WS_PORT?.trim() || process.env.NEXT_PUBLIC_CODEMATION_WS_PORT?.trim();
    if (explicit) {
      return explicit;
    }
    const runtimeDev = process.env.CODEMATION_RUNTIME_DEV_URL?.trim();
    if (!runtimeDev) {
      return undefined;
    }
    try {
      const { port, protocol } = new URL(runtimeDev);
      if (port.length > 0) {
        return port;
      }
      return protocol === "https:" ? "443" : "80";
    } catch {
      return undefined;
    }
  }
}
