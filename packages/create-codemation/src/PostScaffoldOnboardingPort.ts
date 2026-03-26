export interface PostScaffoldOnboardingPort {
  runAfterScaffold(args: Readonly<{ targetDirectory: string; noInteraction: boolean }>): Promise<void>;
}
