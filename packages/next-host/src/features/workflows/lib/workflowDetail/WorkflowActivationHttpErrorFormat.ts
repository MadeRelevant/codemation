import { CodemationApiHttpError } from "../../../../api/CodemationApiHttpError";

export class WorkflowActivationHttpErrorFormat {
  extractMessages(error: unknown): ReadonlyArray<string> {
    if (error instanceof CodemationApiHttpError) {
      const parsed = this.tryParseJson(error.bodyText);
      if (parsed?.errors && parsed.errors.length > 0) {
        return parsed.errors;
      }
      if (parsed?.error && typeof parsed.error === "string") {
        return [parsed.error];
      }
      return [error.message];
    }
    return [error instanceof Error ? error.message : String(error)];
  }

  private tryParseJson(bodyText: string): Readonly<{ error?: string; errors?: ReadonlyArray<string> }> | null {
    try {
      const parsed = JSON.parse(bodyText) as { error?: unknown; errors?: unknown };
      if (Array.isArray(parsed.errors) && parsed.errors.every((x) => typeof x === "string")) {
        return { error: typeof parsed.error === "string" ? parsed.error : undefined, errors: parsed.errors };
      }
      if (typeof parsed.error === "string") {
        return { error: parsed.error };
      }
    } catch {
      return null;
    }
    return null;
  }
}
