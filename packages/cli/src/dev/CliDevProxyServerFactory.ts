import { CliDevProxyServer } from "./CliDevProxyServer";

export class CliDevProxyServerFactory {
  create(gatewayPort: number): CliDevProxyServer {
    return new CliDevProxyServer(gatewayPort);
  }
}
