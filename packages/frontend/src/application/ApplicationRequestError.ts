export class ApplicationRequestError extends Error {
  readonly status: number;

  readonly payload: Readonly<{ error: string }>;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApplicationRequestError";
    this.status = status;
    this.payload = { error: message };
  }
}
