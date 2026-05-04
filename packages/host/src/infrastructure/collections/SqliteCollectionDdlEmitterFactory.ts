import { SqliteCollectionDdlEmitter } from "./SqliteCollectionDdlEmitter";

export class SqliteCollectionDdlEmitterFactory {
  static create(): SqliteCollectionDdlEmitter {
    return new SqliteCollectionDdlEmitter();
  }
}
