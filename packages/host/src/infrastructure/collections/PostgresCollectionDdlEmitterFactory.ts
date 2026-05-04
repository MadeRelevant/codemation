import { PostgresCollectionDdlEmitter } from "./PostgresCollectionDdlEmitter";

export class PostgresCollectionDdlEmitterFactory {
  static create(): PostgresCollectionDdlEmitter {
    return new PostgresCollectionDdlEmitter();
  }
}
