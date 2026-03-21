import type { PersistedRunState } from "@codemation/core";
import { Query } from "../bus/Query";

export class GetRunStateQuery extends Query<PersistedRunState | undefined> {
  constructor(public readonly runId: string) {
    super();
  }
}
