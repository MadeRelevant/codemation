



export class AttachmentIdFactory {
  static create(fallbackValue: string): string {
    const cryptoObject = globalThis.crypto;
    if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
      return cryptoObject.randomUUID();
    }
    return fallbackValue;
  }
}
