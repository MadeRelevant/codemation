import type { WorkflowEvent } from "../../../src/ui/realtime/realtime";
import { WorkflowDetailFixtureFactory } from "./WorkflowDetailFixtures";

export type WorkflowDetailRealtimeServerMessage =
  | Readonly<{ kind: "subscribed"; roomId: string }>
  | Readonly<{ kind: "unsubscribed"; roomId: string }>
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "event"; event: WorkflowEvent }>;

export class WorkflowDetailRealtimeFixtureFactory {
  static subscribed(workflowId = WorkflowDetailFixtureFactory.workflowId): WorkflowDetailRealtimeServerMessage {
    return {
      kind: "subscribed",
      roomId: workflowId,
    };
  }

  static runCreated(): WorkflowDetailRealtimeServerMessage {
    return {
      kind: "event",
      event: {
        kind: "runCreated",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: WorkflowDetailFixtureFactory.startedAt,
      },
    };
  }

  static nodeStarted(nodeId: string, step: number): WorkflowDetailRealtimeServerMessage {
    const snapshot = WorkflowDetailFixtureFactory.createSnapshot(nodeId, "running", step);
    return {
      kind: "event",
      event: {
        kind: "nodeStarted",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: snapshot.updatedAt,
        snapshot,
      },
    };
  }

  static nodeCompleted(nodeId: string, step: number): WorkflowDetailRealtimeServerMessage {
    const snapshot = WorkflowDetailFixtureFactory.createSnapshot(nodeId, "completed", step);
    return {
      kind: "event",
      event: {
        kind: "nodeCompleted",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: snapshot.updatedAt,
        snapshot,
      },
    };
  }

  static runSaved(): WorkflowDetailRealtimeServerMessage {
    return {
      kind: "event",
      event: {
        kind: "runSaved",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: "2026-03-11T12:00:59.000Z",
        state: WorkflowDetailFixtureFactory.createCompletedRunState(),
      },
    };
  }

  static runSavedFailed(): WorkflowDetailRealtimeServerMessage {
    return {
      kind: "event",
      event: {
        kind: "runSaved",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: "2026-03-11T12:00:59.000Z",
        state: WorkflowDetailFixtureFactory.createFailedRunState(),
      },
    };
  }
}
