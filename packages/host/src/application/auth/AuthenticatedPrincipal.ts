export type AuthenticatedPrincipal = Readonly<{
  id: string;
  email: string | null;
  name: string | null;
  /** Set to "managed-jwt" when the principal was verified from a CP-signed bearer token. */
  source?: "managed-jwt";
  /** The workspace ID from the JWT `aud` claim. Present when source === "managed-jwt". */
  workspaceId?: string;
}>;
