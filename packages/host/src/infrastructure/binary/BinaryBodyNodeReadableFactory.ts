



import { Readable } from "node:stream";

import { ReadableStream } from "node:stream/web";


import type { BinaryBody } from "@codemation/core";



export class BinaryBodyNodeReadableFactory {
  constructor(private readonly body: BinaryBody) {}

  create(): Readable {
    if (this.body instanceof Uint8Array) {
      return Readable.from([this.body]);
    }
    if (this.body instanceof ArrayBuffer) {
      return Readable.from([new Uint8Array(this.body)]);
    }
    if (this.body instanceof ReadableStream) {
      return Readable.fromWeb(this.body);
    }
    return Readable.from(this.body);
  }
}
