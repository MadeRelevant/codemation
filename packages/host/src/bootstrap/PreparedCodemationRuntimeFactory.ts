import type { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import type {
  Container,
  RunEventBus,
  TriggerSetupStateRepository,
  WorkflowExecutionRepository,
} from "@codemation/core";
import {
  CoreTokens,
  EventPublishingWorkflowExecutionRepository,
  InMemoryRunEventBus,
  instanceCachingFactory,
  SystemClock,
} from "@codemation/core";
import {
  ConfigDrivenOffloadPolicy,
  DefaultDrivingScheduler,
  DefaultExecutionContextFactory,
  InlineDrivingScheduler,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";
import { RedisRunEventBus } from "@codemation/eventbus-redis";
import type { BootRuntimeSummary } from "../application/dev/BootRuntimeSummary.types";
import { BootRuntimeSnapshotHolder } from "../application/dev/BootRuntimeSnapshotHolder";
import { ApplicationTokens } from "../applicationTokens";
import { UserAccountService } from "../domain/users/UserAccountServiceRegistry";
import type { WorkflowRunRepository } from "../domain/runs/WorkflowRunRepository";
import type { WorkflowDebuggerOverlayRepository } from "../domain/workflows/WorkflowDebuggerOverlayRepository";
import type { CodemationAuthConfig } from "../presentation/config/CodemationAuthConfig";
import type { CodemationApplicationRuntimeConfig } from "../presentation/config/CodemationConfig";
import type { CodemationWhitelabelConfig } from "../presentation/config/CodemationWhitelabelConfig";
import { CredentialSessionServiceImpl } from "../domain/credentials/CredentialServices";
import { LocalFilesystemBinaryStorage } from "../infrastructure/binary/LocalFilesystemBinaryStorageRegistry";
import {
  InMemoryCredentialStore,
  PrismaCredentialStore,
} from "../infrastructure/persistence/CredentialPersistenceStore";
import { InMemoryTriggerSetupStateRepository } from "../infrastructure/persistence/InMemoryTriggerSetupStateRepository";
import { InMemoryWorkflowActivationRepository } from "../infrastructure/persistence/InMemoryWorkflowActivationRepository";
import { InMemoryWorkflowDebuggerOverlayRepository } from "../infrastructure/persistence/InMemoryWorkflowDebuggerOverlayRepository";
import { InMemoryWorkflowRunRepository } from "../infrastructure/persistence/InMemoryWorkflowRunRepository";
import { PrismaClientFactory } from "../infrastructure/persistence/PrismaClientFactory";
import { PrismaClient } from "../infrastructure/persistence/generated/prisma-client/client.js";
import { PrismaTriggerSetupStateRepository } from "../infrastructure/persistence/PrismaTriggerSetupStateRepository";
import { PrismaWorkflowActivationRepository } from "../infrastructure/persistence/PrismaWorkflowActivationRepository";
import { PrismaWorkflowDebuggerOverlayRepository } from "../infrastructure/persistence/PrismaWorkflowDebuggerOverlayRepository";
import { PrismaWorkflowRunRepository } from "../infrastructure/persistence/PrismaWorkflowRunRepository";
import type { ResolvedDatabasePersistence } from "../infrastructure/persistence/DatabasePersistenceResolver";
import { AppConfigFactory } from "./runtime/AppConfigFactory";
import type { ResolvedImplementationSelection } from "./runtime/ResolvedImplementationSelectionFactory";
import { ResolvedImplementationSelectionFactory } from "./runtime/ResolvedImplementationSelectionFactory";
import { PreparedCodemationRuntime } from "./PreparedCodemationRuntime";
import type { AppConfig } from "../presentation/config/AppConfig";

type PrismaClientResolution = Readonly<{
  prismaClient: PrismaClient;
  ownedPrismaClient?: PrismaClient;
  ownedPglite?: PGlite;
}>;

type PreparedRuntimePersistence = Readonly<{
  workflowExecutionRepository: WorkflowExecutionRepository;
  triggerSetupStateRepository: TriggerSetupStateRepository;
  workflowRunRepository?: WorkflowRunRepository;
  workflowDebuggerOverlayRepository: WorkflowDebuggerOverlayRepository;
  prismaClient?: PrismaClient;
  ownedPrismaClient?: PrismaClient;
  ownedPglite?: PGlite;
}>;

export class PreparedCodemationRuntimeFactory {
  constructor(
    private readonly implementationSelectionFactory: ResolvedImplementationSelectionFactory = new ResolvedImplementationSelectionFactory(),
    private readonly appConfigFactory: AppConfigFactory = new AppConfigFactory(),
  ) {}

  async prepare(
    args: Readonly<{
      container: Container;
      repoRoot: string;
      consumerRoot: string;
      env: NodeJS.ProcessEnv;
      workflowSources: ReadonlyArray<string>;
      runtimeConfig: CodemationApplicationRuntimeConfig;
      applicationAuthConfig: CodemationAuthConfig | undefined;
      whitelabelConfig: CodemationWhitelabelConfig;
      hasConfiguredCredentialSessionServiceRegistration: boolean;
    }>,
  ): Promise<PreparedCodemationRuntime> {
    const usesProvidedPrismaClientOverride = this.hasProvidedPrismaClientOverride(args.container);
    const implementationSelection = this.implementationSelectionFactory.resolve({
      consumerRoot: args.consumerRoot,
      env: args.env,
      runtimeConfig: args.runtimeConfig,
    });
    const runtimeSummary = this.createRuntimeSummary(implementationSelection);
    args.container.resolve(BootRuntimeSnapshotHolder).set(runtimeSummary);
    const eventBus = this.createRunEventBus(implementationSelection);
    const persistence = await this.createRunPersistence(args.container, implementationSelection, eventBus);
    const binaryStorage = this.createBinaryStorage(args.repoRoot);
    const appConfig: AppConfig = this.appConfigFactory.create({
      repoRoot: args.repoRoot,
      consumerRoot: args.consumerRoot,
      env: args.env,
      workflowSources: args.workflowSources,
      runtimeConfig: args.runtimeConfig,
      authConfig: args.applicationAuthConfig,
      whitelabelConfig: args.whitelabelConfig,
    });

    args.container.registerInstance(CoreTokens.RunEventBus, eventBus);
    args.container.registerInstance(CoreTokens.WorkflowExecutionRepository, persistence.workflowExecutionRepository);
    args.container.registerInstance(CoreTokens.TriggerSetupStateRepository, persistence.triggerSetupStateRepository);
    args.container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
    args.container.registerInstance(CoreTokens.BinaryStorage, binaryStorage);
    args.container.registerInstance(
      CoreTokens.ExecutionContextFactory,
      new DefaultExecutionContextFactory(binaryStorage),
    );
    args.container.registerInstance(ApplicationTokens.AppConfig, appConfig);
    args.container.registerInstance(ApplicationTokens.Clock, new SystemClock());
    args.container.registerInstance(ApplicationTokens.CodemationAuthConfig, args.applicationAuthConfig);
    args.container.registerInstance(ApplicationTokens.CodemationWhitelabelConfig, args.whitelabelConfig);
    args.container.registerInstance(ApplicationTokens.WebSocketPort, this.resolveWebSocketPort(args.env));
    args.container.registerInstance(ApplicationTokens.WebSocketBindHost, args.env.CODEMATION_WS_BIND_HOST ?? "0.0.0.0");
    args.container.register(UserAccountService, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const prismaClient = dependencyContainer.isRegistered(PrismaClient, true)
          ? dependencyContainer.resolve(PrismaClient)
          : undefined;
        return new UserAccountService(
          dependencyContainer.resolve(ApplicationTokens.CodemationAuthConfig),
          prismaClient,
        );
      }),
    });
    args.container.registerInstance(
      ApplicationTokens.WorkflowDebuggerOverlayRepository,
      persistence.workflowDebuggerOverlayRepository,
    );
    if (persistence.workflowRunRepository) {
      args.container.registerInstance(ApplicationTokens.WorkflowRunRepository, persistence.workflowRunRepository);
    }
    if (persistence.prismaClient) {
      args.container.registerInstance(PrismaClient, persistence.prismaClient);
      args.container.registerInstance(ApplicationTokens.PrismaClient, persistence.prismaClient);
    }
    const workflowActivationRepository = persistence.prismaClient
      ? args.container.resolve(PrismaWorkflowActivationRepository)
      : args.container.resolve(InMemoryWorkflowActivationRepository);
    args.container.registerInstance(ApplicationTokens.WorkflowActivationRepository, workflowActivationRepository);
    if (implementationSelection.databasePersistence.kind !== "none") {
      args.container.registerInstance(ApplicationTokens.CredentialStore, args.container.resolve(PrismaCredentialStore));
    } else {
      args.container.registerInstance(
        ApplicationTokens.CredentialStore,
        args.container.resolve(InMemoryCredentialStore),
      );
    }
    if (!args.hasConfiguredCredentialSessionServiceRegistration) {
      args.container.register(CoreTokens.CredentialSessionService, {
        useFactory: instanceCachingFactory((dependencyContainer) =>
          dependencyContainer.resolve(CredentialSessionServiceImpl),
        ),
      });
    }
    if (implementationSelection.workerRuntimeScheduler) {
      args.container.registerInstance(
        ApplicationTokens.WorkerRuntimeScheduler,
        implementationSelection.workerRuntimeScheduler,
      );
    }
    this.registerRuntimeNodeActivationScheduler(args.container);

    return new PreparedCodemationRuntime(
      args.container,
      runtimeSummary,
      implementationSelection,
      usesProvidedPrismaClientOverride,
      persistence.ownedPrismaClient ?? null,
      persistence.ownedPglite ?? null,
    );
  }

  private createRuntimeSummary(selection: ResolvedImplementationSelection): BootRuntimeSummary {
    return {
      databasePersistence: selection.databasePersistence,
      eventBusKind: selection.eventBusKind,
      queuePrefix: selection.queuePrefix,
      schedulerKind: selection.schedulerKind,
      redisUrl: selection.redisUrl,
    };
  }

  private createRunEventBus(selection: ResolvedImplementationSelection): RunEventBus {
    if (selection.eventBusKind === "redis") {
      return new RedisRunEventBus(this.requireRedisUrl(selection.redisUrl), selection.queuePrefix);
    }
    return new InMemoryRunEventBus();
  }

  private async createRunPersistence(
    container: Container,
    selection: ResolvedImplementationSelection,
    eventBus: RunEventBus,
  ): Promise<PreparedRuntimePersistence> {
    if (selection.databasePersistence.kind === "none") {
      const workflowRunRepository = container.resolve(InMemoryWorkflowRunRepository);
      return {
        workflowRunRepository,
        triggerSetupStateRepository: container.resolve(InMemoryTriggerSetupStateRepository),
        workflowDebuggerOverlayRepository: container.resolve(InMemoryWorkflowDebuggerOverlayRepository),
        workflowExecutionRepository: new EventPublishingWorkflowExecutionRepository(workflowRunRepository, eventBus),
      };
    }
    const prismaClientResolution = await this.resolveInjectedOrOwnedPrismaClient(
      container,
      selection.databasePersistence,
    );
    const childContainer = container.createChildContainer();
    childContainer.registerInstance(PrismaClient, prismaClientResolution.prismaClient);
    const workflowRunRepository = childContainer.resolve(PrismaWorkflowRunRepository);
    const triggerSetupStateRepository = childContainer.resolve(PrismaTriggerSetupStateRepository);
    const workflowDebuggerOverlayRepository = childContainer.resolve(PrismaWorkflowDebuggerOverlayRepository);
    return {
      prismaClient: prismaClientResolution.prismaClient,
      ownedPrismaClient: prismaClientResolution.ownedPrismaClient,
      ownedPglite: prismaClientResolution.ownedPglite,
      workflowRunRepository,
      triggerSetupStateRepository,
      workflowDebuggerOverlayRepository,
      workflowExecutionRepository: new EventPublishingWorkflowExecutionRepository(workflowRunRepository, eventBus),
    };
  }

  private hasProvidedPrismaClientOverride(container: Container): boolean {
    return container.isRegistered(PrismaClient, true);
  }

  private async resolveInjectedOrOwnedPrismaClient(
    container: Container,
    persistence: Exclude<ResolvedDatabasePersistence, Readonly<{ kind: "none" }>>,
  ): Promise<PrismaClientResolution> {
    if (this.hasProvidedPrismaClientOverride(container)) {
      return {
        prismaClient: container.resolve(PrismaClient),
      };
    }
    const factory = container.resolve(PrismaClientFactory);
    if (persistence.kind === "postgresql") {
      const prismaClient = factory.createPostgres(persistence.databaseUrl);
      return {
        prismaClient,
        ownedPrismaClient: prismaClient,
      };
    }
    if (persistence.kind !== "pglite") {
      throw new Error("Unexpected database persistence mode for Prisma.");
    }
    const { prismaClient, pglite } = await factory.createPglite(persistence.dataDir);
    return {
      prismaClient,
      ownedPrismaClient: prismaClient,
      ownedPglite: pglite,
    };
  }

  private registerRuntimeNodeActivationScheduler(container: Container): void {
    container.register(CoreTokens.NodeActivationScheduler, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const inlineScheduler = dependencyContainer.resolve(InlineDrivingScheduler);
        if (!dependencyContainer.isRegistered(ApplicationTokens.WorkerRuntimeScheduler, true)) {
          return inlineScheduler;
        }
        return new DefaultDrivingScheduler(
          new ConfigDrivenOffloadPolicy(),
          dependencyContainer.resolve(ApplicationTokens.WorkerRuntimeScheduler),
          inlineScheduler,
        );
      }),
    });
  }

  private createBinaryStorage(repoRoot: string): InMemoryBinaryStorage | LocalFilesystemBinaryStorage {
    if (!repoRoot) {
      return new InMemoryBinaryStorage();
    }
    return new LocalFilesystemBinaryStorage(path.join(repoRoot, ".codemation", "binary"));
  }

  private requireRedisUrl(redisUrl: string | undefined): string {
    if (!redisUrl) {
      throw new Error("Redis-backed runtime requires runtime.eventBus.redisUrl or REDIS_URL.");
    }
    return redisUrl;
  }

  private resolveWebSocketPort(env: Readonly<NodeJS.ProcessEnv>): number {
    const rawPort = env.CODEMATION_WS_PORT ?? env.VITE_CODEMATION_WS_PORT;
    const parsedPort = Number(rawPort);
    if (Number.isInteger(parsedPort) && parsedPort > 0) {
      return parsedPort;
    }
    return 3001;
  }
}
