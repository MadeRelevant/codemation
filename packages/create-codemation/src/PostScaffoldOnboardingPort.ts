export interface PostScaffoldOnboardingPort {
  runAfterScaffold(
    args: Readonly<{
      templateId: string;
      targetDirectory: string;
      noInteraction: boolean;
      adminUser?: Readonly<{ email: string; password: string }>;
    }>,
  ): Promise<void>;
}
