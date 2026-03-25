import { DevLock } from "./DevLock";

export class DevLockFactory {
  create(): DevLock {
    return new DevLock();
  }
}
