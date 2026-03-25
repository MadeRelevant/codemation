import { DevSourceWatcher } from "./DevSourceWatcher";

export class DevSourceWatcherFactory {
  create(): DevSourceWatcher {
    return new DevSourceWatcher();
  }
}
