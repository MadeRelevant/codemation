export interface PostScaffoldOnboardingPort {
  runAfterScaffold(
    args: Readonly<{
      targetDirectory: string;
      noInteraction: boolean;
      adminUser?: Readonly<{ email: string; password: string }>;
    }>,
  ): Promise<void>;
}
