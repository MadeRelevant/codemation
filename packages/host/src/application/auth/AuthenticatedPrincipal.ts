export type AuthenticatedPrincipal = Readonly<{
  id: string;
  email: string | null;
  name: string | null;
}>;
