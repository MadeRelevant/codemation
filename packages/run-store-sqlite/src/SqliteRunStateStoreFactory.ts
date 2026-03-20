import type { NodeId,NodeOutputs,ParentExecutionRef,PersistedRunState,RunId,RunListingStore,RunStateStore,RunStatus,RunSummary,WorkflowId } from "@codemation/core";
import Database from "better-sqlite3";

type DbRow = Readonly<{ run_id: string; state_json: string }>;

type MetaRow = Readonly<{
  run_id: string;
  workflow_id: string;
  started_at: string;
  status: string;
  parent_json: string | null;
  updated_at: string;
}>;

export class SqliteRunStateStore implements RunStateStore, RunListingStore {
  private db: Database.Database | undefined;
  private isInitialized = false;

  constructor(private readonly dbPath: string) {}

  async createRun(args: { runId: RunId; workflowId: WorkflowId; startedAt: string; parent?: ParentExecutionRef; executionOptions?: PersistedRunState["executionOptions"] }): Promise<void> {
    const state: PersistedRunState = {
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      status: "running",
      queue: [],
      outputsByNode: {} as Record<NodeId, NodeOutputs>,
      nodeSnapshotsByNodeId: {},
    };
    await this.save(state);
  }

  async load(runId: RunId): Promise<PersistedRunState | undefined> {
    const db = this.ensureOpen();
    this.ensureInitialized(db);

    const stmt = db.prepare("SELECT run_id, state_json FROM runs WHERE run_id = ?");
    const row = stmt.get(runId as unknown as string) as DbRow | undefined;
    if (!row) return undefined;
    return this.parseState(row.state_json);
  }

  async save(state: PersistedRunState): Promise<void> {
    const db = this.ensureOpen();
    this.ensureInitialized(db);

    const json = this.stringifyState(state);
    const stmt = db.prepare("INSERT INTO runs (run_id, state_json) VALUES (?, ?) ON CONFLICT(run_id) DO UPDATE SET state_json = excluded.state_json");
    stmt.run(state.runId as unknown as string, json);

    const now = new Date().toISOString();
    const parentJson = state.parent ? JSON.stringify(state.parent) : null;
    const metaStmt = db.prepare(
      "INSERT INTO runs_meta (run_id, workflow_id, started_at, status, parent_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET workflow_id = excluded.workflow_id, started_at = excluded.started_at, status = excluded.status, parent_json = excluded.parent_json, updated_at = excluded.updated_at",
    );
    metaStmt.run(
      state.runId as unknown as string,
      state.workflowId as unknown as string,
      state.startedAt,
      state.status,
      parentJson,
      now,
    );
  }

  async listRuns(args?: Readonly<{ workflowId?: WorkflowId; limit?: number }>): Promise<ReadonlyArray<RunSummary>> {
    const db = this.ensureOpen();
    this.ensureInitialized(db);

    const limit = args?.limit ?? 50;
    const workflowId = args?.workflowId;

    const rows = workflowId
      ? (db
          .prepare(
            "SELECT run_id, workflow_id, started_at, status, parent_json, updated_at FROM runs_meta WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?",
          )
          .all(workflowId as unknown as string, limit) as MetaRow[])
      : (db
          .prepare("SELECT run_id, workflow_id, started_at, status, parent_json, updated_at FROM runs_meta ORDER BY started_at DESC LIMIT ?")
          .all(limit) as MetaRow[]);

    return rows.map((r): RunSummary => {
      const parent = r.parent_json ? (JSON.parse(r.parent_json) as ParentExecutionRef) : undefined;
      const status = r.status as RunStatus;
      const finishedAt = status === "completed" || status === "failed" ? r.updated_at : undefined;
      return {
        runId: r.run_id as unknown as RunId,
        workflowId: r.workflow_id as unknown as WorkflowId,
        startedAt: r.started_at,
        status,
        finishedAt,
        parent,
      };
    });
  }

  private ensureOpen(): Database.Database {
    if (this.db) return this.db;
    const db = new Database(this.dbPath);
    this.db = db;
    return db;
  }

  private ensureInitialized(db: Database.Database): void {
    if (this.isInitialized) return;
    db.pragma("journal_mode = WAL");
    db.exec("CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, state_json TEXT NOT NULL)");
    db.exec(
      "CREATE TABLE IF NOT EXISTS runs_meta (run_id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, started_at TEXT NOT NULL, status TEXT NOT NULL, parent_json TEXT NULL, updated_at TEXT NOT NULL)",
    );
    db.exec("CREATE INDEX IF NOT EXISTS idx_runs_meta_workflow_started_at ON runs_meta (workflow_id, started_at DESC)");
    this.isInitialized = true;
  }

  private parseState(json: string): PersistedRunState {
    const parsed = JSON.parse(json) as PersistedRunState;
    return {
      ...parsed,
      nodeSnapshotsByNodeId: parsed.nodeSnapshotsByNodeId ?? {},
    };
  }

  private stringifyState(state: PersistedRunState): string {
    return JSON.stringify(state);
  }
}

