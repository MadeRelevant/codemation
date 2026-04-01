import { CodemationApiHttpError } from "../../../../api/CodemationApiHttpError";

export class WorkflowQueryRetryPolicy {
  static shouldRetry(failureCount: number, error: unknown): boolean {
    if (error instanceof CodemationApiHttpError && error.status === 404) {
      return false;
    }
    return failureCount < 3;
  }
}
