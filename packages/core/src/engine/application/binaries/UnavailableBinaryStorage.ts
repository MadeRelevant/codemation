import type { BinaryStorage } from "../../../types";

export class UnavailableBinaryStorage implements BinaryStorage {
  readonly driverName = "unavailable";

  async write(): Promise<never> {
    throw new Error("Binary storage is not configured for this runtime.");
  }

  async openReadStream(): Promise<undefined> {
    return undefined;
  }

  async stat(): Promise<{ exists: false }> {
    return { exists: false };
  }

  async delete(): Promise<void> {}
}
