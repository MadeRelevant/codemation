export type CodemationSession = Readonly<{
  id: string;
  email: string | null;
  name: string | null;
}>;

export type CodemationSessionContextValue = Readonly<{
  enabled: boolean;
  session: CodemationSession | null;
  status: "anonymous" | "authenticated" | "loading";
}>;
