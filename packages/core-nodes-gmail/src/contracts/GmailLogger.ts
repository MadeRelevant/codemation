export interface GmailLogger {
  info(message: string, exception?: Error): void;
  warn(message: string, exception?: Error): void;
  error(message: string, exception?: Error): void;
  debug(message: string, exception?: Error): void;
}
