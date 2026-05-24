import type { AppConfig } from "../config/AppConfig";
import { WorkflowWebsocketServer } from "./WorkflowWebsocketServer";
import { logLevelPolicyFactory } from "../../infrastructure/logging/LogLevelPolicyFactory";
import { ServerLoggerFactory } from "../../infrastructure/logging/ServerLoggerFactory";

const loggerFactory = new ServerLoggerFactory(logLevelPolicyFactory);

export class WorkflowWebsocketServerFactory {
  create(appConfig: AppConfig): WorkflowWebsocketServer {
    return new WorkflowWebsocketServer(
      appConfig.webSocketPort,
      appConfig.webSocketBindHost,
      loggerFactory.create("codemation-websocket.server"),
    );
  }
}
