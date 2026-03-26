export class ApplicationRequestError extends Error {
  readonly status: number;

  readonly payload: Readonly<{ error: string; errors?: ReadonlyArray<string> }>;

  constructor(status: number, message: string, errors?: ReadonlyArray<string>) {
    super(message);
    this.name = "ApplicationRequestError";
    this.status = status;
    this.payload = errors && errors.length > 0 ? { error: message, errors } : { error: message };
  }
}
