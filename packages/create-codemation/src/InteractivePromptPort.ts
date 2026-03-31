/**
 * Prompts for create-codemation onboarding (injectable for tests).
 */
export interface InteractivePromptPort {
  confirm(message: string, options?: Readonly<{ defaultValue?: boolean }>): Promise<boolean>;
  question(message: string, options?: Readonly<{ maskInput?: boolean }>): Promise<string>;
}
