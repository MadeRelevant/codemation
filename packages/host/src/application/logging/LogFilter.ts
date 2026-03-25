export type LogFilter = (
  entry: Readonly<{
    scope: string;
    level: "info" | "warn" | "error" | "debug";
    message: string;
  }>,
) => boolean;
