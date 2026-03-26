/**
 * Prompts for create-codemation onboarding (injectable for tests).
 */
export interface InteractivePromptPort {
  confirm(message: string): Promise<boolean>;
  question(message: string): Promise<string>;
}
