import type { Clock, TypeToken } from "@codemation/core";
import type { SessionVerifier } from "./application/auth/SessionVerifier";
import type { Command } from "./application/bus/Command";
import type { CommandBus } from "./application/bus/CommandBus";
import type { CommandHandler } from "./application/bus/CommandHandler";
import type { DomainEvent } from "./application/bus/DomainEvent";
import type { DomainEventBus } from "./application/bus/DomainEventBus";
import type { DomainEventHandler } from "./application/bus/DomainEventHandler";
import type { Query } from "./application/bus/Query";
import type { QueryBus } from "./application/bus/QueryBus";
import type { QueryHandler } from "./application/bus/QueryHandler";
import type { Logger, LoggerFactory } from "./application/logging/Logger";
import type { WorkflowWebsocketPublisher } from "./application/websocket/WorkflowWebsocketPublisher";
import type { CredentialStore } from "./domain/credentials/CredentialServices";
import type { WorkflowRunRepository } from "./domain/runs/WorkflowRunRepository";
import type { WorkflowDebuggerOverlayRepository } from "./domain/workflows/WorkflowDebuggerOverlayRepository";
import type { WorkflowDefinitionRepository } from "./domain/workflows/WorkflowDefinitionRepository";
import type { WorkflowActivationRepository } from "./domain/workflows/WorkflowActivationRepository";
import type { PrismaDatabaseClient } from "./infrastructure/persistence/PrismaDatabaseClient";
import type { WorkerRuntimeScheduler } from "./infrastructure/scheduler/WorkerRuntimeScheduler";
import type { AppConfig } from "./presentation/config/AppConfig";
import type { CodemationAuthConfig } from "./presentation/config/CodemationAuthConfig";
import type { CodemationWhitelabelConfig } from "./presentation/config/CodemationWhitelabelConfig";
import type { HonoApiRouteRegistrar } from "./presentation/http/hono/HonoApiRouteRegistrar";

export const ApplicationTokens = {
  CodemationAuthConfig: Symbol.for("codemation.application.CodemationAuthConfig") as TypeToken<
    CodemationAuthConfig | undefined
  >,
  CodemationWhitelabelConfig: Symbol.for(
    "codemation.application.CodemationWhitelabelConfig",
  ) as TypeToken<CodemationWhitelabelConfig>,
  AppConfig: Symbol.for("codemation.application.AppConfig") as TypeToken<AppConfig>,
  WebSocketPort: Symbol.for("codemation.application.WebSocketPort") as TypeToken<number>,
  WebSocketBindHost: Symbol.for("codemation.application.WebSocketBindHost") as TypeToken<string>,
  QueryBus: Symbol.for("codemation.application.QueryBus") as TypeToken<QueryBus>,
  CommandBus: Symbol.for("codemation.application.CommandBus") as TypeToken<CommandBus>,
  DomainEventBus: Symbol.for("codemation.application.DomainEventBus") as TypeToken<DomainEventBus>,
  QueryHandler: Symbol.for("codemation.application.QueryHandler") as TypeToken<QueryHandler<Query<unknown>, unknown>>,
  CommandHandler: Symbol.for("codemation.application.CommandHandler") as TypeToken<
    CommandHandler<Command<unknown>, unknown>
  >,
  DomainEventHandler: Symbol.for("codemation.application.DomainEventHandler") as TypeToken<
    DomainEventHandler<DomainEvent>
  >,
  HonoApiRouteRegistrar: Symbol.for("codemation.application.HonoApiRouteRegistrar") as TypeToken<HonoApiRouteRegistrar>,
  WorkflowWebsocketPublisher: Symbol.for(
    "codemation.application.WorkflowWebsocketPublisher",
  ) as TypeToken<WorkflowWebsocketPublisher>,
  WorkerRuntimeScheduler: Symbol.for(
    "codemation.application.WorkerRuntimeScheduler",
  ) as TypeToken<WorkerRuntimeScheduler>,
  WorkflowDefinitionRepository: Symbol.for(
    "codemation.application.WorkflowDefinitionRepository",
  ) as TypeToken<WorkflowDefinitionRepository>,
  WorkflowActivationRepository: Symbol.for(
    "codemation.application.WorkflowActivationRepository",
  ) as TypeToken<WorkflowActivationRepository>,
  WorkflowDebuggerOverlayRepository: Symbol.for(
    "codemation.application.WorkflowDebuggerOverlayRepository",
  ) as TypeToken<WorkflowDebuggerOverlayRepository>,
  WorkflowRunRepository: Symbol.for("codemation.application.WorkflowRunRepository") as TypeToken<WorkflowRunRepository>,
  LoggerFactory: Symbol.for("codemation.application.LoggerFactory") as TypeToken<LoggerFactory>,
  /**
   * Opt-in timing/diagnostics logger (`CODEMATION_PERFORMANCE_LOGGING` + normal minimum log level).
   */
  PerformanceDiagnosticsLogger: Symbol.for("codemation.application.PerformanceDiagnosticsLogger") as TypeToken<Logger>,
  CredentialStore: Symbol.for("codemation.application.CredentialStore") as TypeToken<CredentialStore>,
  PrismaClient: Symbol.for("codemation.application.PrismaClient") as TypeToken<PrismaDatabaseClient>,
  SessionVerifier: Symbol.for("codemation.application.SessionVerifier") as TypeToken<SessionVerifier>,
  Clock: Symbol.for("codemation.application.Clock") as TypeToken<Clock>,
} as const;
