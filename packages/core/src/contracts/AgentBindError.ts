/**
 * Thrown at agent bind time when mcpServers declarations cannot be resolved.
 * Causes include: unknown server id, missing credential instance, insufficient scopes,
 * and ambiguous shorthand binding (multiple credential instances match).
 */
export class AgentBindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentBindError";
  }
}
