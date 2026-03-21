export interface Logger {
  info(message: string, exception?: Error): void;
  warn(message: string, exception?: Error): void;
  error(message: string, exception?: Error): void;
  debug(message: string, exception?: Error): void;
}

export interface LoggerFactory {
  create(scope: string): Logger;
}
