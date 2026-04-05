import type { CodemationSession } from "../providers/CodemationSession.types";

/**
 * Maps Better Auth `GET /api/auth/get-session` payloads to the UI session shape.
 */
export class CodemationBetterAuthPrincipalMapper {
  fromGetSessionPayload(payload: unknown): CodemationSession | null {
    if (payload === null || payload === undefined) {
      return null;
    }
    if (typeof payload !== "object") {
      return null;
    }
    const record = payload as Record<string, unknown>;
    const user = record.user;
    if (user === null || user === undefined || typeof user !== "object") {
      return null;
    }
    const userRecord = user as Record<string, unknown>;
    const id = userRecord.id;
    if (typeof id !== "string") {
      return null;
    }
    return {
      id,
      email: typeof userRecord.email === "string" ? userRecord.email : null,
      name: typeof userRecord.name === "string" ? userRecord.name : null,
    };
  }
}
