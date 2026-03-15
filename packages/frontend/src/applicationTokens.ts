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
import type { WorkflowDefinitionRepository } from "./domain/workflows/WorkflowDefinitionRepository";
import type { WebhookEndpointRepository } from "./domain/webhooks/WebhookEndpointRepository";
import type { HttpRouteHandler } from "./presentation/http/HttpRouteHandler";
import type { WorkerRuntimeScheduler } from "./infrastructure/runtime/WorkerRuntimeScheduler";

export const ApplicationTokens = {
  WebSocketPort: Symbol.for("codemation.application.WebSocketPort") as TypeToken<number>,
  WebSocketBindHost: Symbol.for("codemation.application.WebSocketBindHost") as TypeToken<string>,
  QueryBus: Symbol.for("codemation.application.QueryBus") as TypeToken<QueryBus>,
  CommandBus: Symbol.for("codemation.application.CommandBus") as TypeToken<CommandBus>,
  DomainEventBus: Symbol.for("codemation.application.DomainEventBus") as TypeToken<DomainEventBus>,
  QueryHandler: Symbol.for("codemation.application.QueryHandler") as TypeToken<QueryHandler<Query<unknown>, unknown>>,
  CommandHandler: Symbol.for("codemation.application.CommandHandler") as TypeToken<CommandHandler<Command<unknown>, unknown>>,
  DomainEventHandler: Symbol.for("codemation.application.DomainEventHandler") as TypeToken<DomainEventHandler<DomainEvent>>,
  HttpRouteHandler: Symbol.for("codemation.application.HttpRouteHandler") as TypeToken<HttpRouteHandler>,
  WorkflowWebsocketPublisher: Symbol.for("codemation.application.WorkflowWebsocketPublisher") as TypeToken<WorkflowWebsocketPublisher>,
  WorkerRuntimeScheduler: Symbol.for("codemation.application.WorkerRuntimeScheduler") as TypeToken<WorkerRuntimeScheduler>,
  WorkflowDefinitionRepository: Symbol.for("codemation.application.WorkflowDefinitionRepository") as TypeToken<WorkflowDefinitionRepository>,
  WorkflowRunRepository: Symbol.for("codemation.application.WorkflowRunRepository") as TypeToken<WorkflowRunRepository>,
  WebhookEndpointRepository: Symbol.for("codemation.application.WebhookEndpointRepository") as TypeToken<WebhookEndpointRepository>,
} as const;
