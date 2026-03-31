import { CliDevProxyServer } from "./CliDevProxyServer";
import { ListenPortConflictDescriber } from "./ListenPortConflictDescriber";

export class CliDevProxyServerFactory {
  private readonly listenPortConflictDescriber = new ListenPortConflictDescriber();

  create(gatewayPort: number): CliDevProxyServer {
    return new CliDevProxyServer(gatewayPort, this.listenPortConflictDescriber);
  }
}
