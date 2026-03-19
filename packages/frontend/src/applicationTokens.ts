import type { TypeToken } from "@codemation/core";
import type { Command } from "./application/bus/Command";
import type { CommandBus } from "./application/bus/CommandBus";
import type { CommandHandler } from "./application/bus/CommandHandler";
import type { DomainEvent } from "./application/bus/DomainEvent";
import type { DomainEventBus } from "./application/bus/DomainEventBus";
import type { DomainEventHandler } from "./application/bus/DomainEventHandler";
import type { Query } from "./application/bus/Query";
import type { QueryBus } from "./application/bus/QueryBus";
import type { QueryHandler } from "./application/bus/QueryHandler";
import type { WorkflowWebsocketPublisher } from "./application/websocket/WorkflowWebsocketPublisher";
import type { WorkflowRunRepository } from "./domain/runs/WorkflowRunRepository";
import type { WorkflowDebuggerOverlayRepository } from "./domain/workflows/WorkflowDebuggerOverlayRepository";
import type { WorkflowDefinitionRepository } from "./domain/workflows/WorkflowDefinitionRepository";
import type { WebhookEndpointRepository } from "./domain/webhooks/WebhookEndpointRepository";
import type { HonoApiRouteRegistrar } from "./presentation/http/hono/HonoApiRouteRegistrar";
import type { WorkerRuntimeScheduler } from "./infrastructure/runtime/WorkerRuntimeScheduler";
import type { LoggerFactory } from "./application/logging/Logger";
import type { CredentialStore } from "./domain/credentials/CredentialServices";

export const ApplicationTokens = {
  WebSocketPort: Symbol.for("codemation.application.WebSocketPort") as TypeToken<number>,
  WebSocketBindHost: Symbol.for("codemation.application.WebSocketBindHost") as TypeToken<string>,
  QueryBus: Symbol.for("codemation.application.QueryBus") as TypeToken<QueryBus>,
  CommandBus: Symbol.for("codemation.application.CommandBus") as TypeToken<CommandBus>,
  DomainEventBus: Symbol.for("codemation.application.DomainEventBus") as TypeToken<DomainEventBus>,
  QueryHandler: Symbol.for("codemation.application.QueryHandler") as TypeToken<QueryHandler<Query<unknown>, unknown>>,
  CommandHandler: Symbol.for("codemation.application.CommandHandler") as TypeToken<CommandHandler<Command<unknown>, unknown>>,
  DomainEventHandler: Symbol.for("codemation.application.DomainEventHandler") as TypeToken<DomainEventHandler<DomainEvent>>,
  HonoApiRouteRegistrar: Symbol.for("codemation.application.HonoApiRouteRegistrar") as TypeToken<HonoApiRouteRegistrar>,
  WorkflowWebsocketPublisher: Symbol.for("codemation.application.WorkflowWebsocketPublisher") as TypeToken<WorkflowWebsocketPublisher>,
  WorkerRuntimeScheduler: Symbol.for("codemation.application.WorkerRuntimeScheduler") as TypeToken<WorkerRuntimeScheduler>,
  WorkflowDefinitionRepository: Symbol.for("codemation.application.WorkflowDefinitionRepository") as TypeToken<WorkflowDefinitionRepository>,
  WorkflowDebuggerOverlayRepository: Symbol.for("codemation.application.WorkflowDebuggerOverlayRepository") as TypeToken<WorkflowDebuggerOverlayRepository>,
  WorkflowRunRepository: Symbol.for("codemation.application.WorkflowRunRepository") as TypeToken<WorkflowRunRepository>,
  WebhookEndpointRepository: Symbol.for("codemation.application.WebhookEndpointRepository") as TypeToken<WebhookEndpointRepository>,
  LoggerFactory: Symbol.for("codemation.application.LoggerFactory") as TypeToken<LoggerFactory>,
  CredentialStore: Symbol.for("codemation.application.CredentialStore") as TypeToken<CredentialStore>,
  ProcessEnv: Symbol.for("codemation.application.ProcessEnv") as TypeToken<Readonly<NodeJS.ProcessEnv>>,
} as const;
