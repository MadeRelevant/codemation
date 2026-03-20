
import { ReadableStream } from "node:stream/web";




export class BinaryBodyReadableStreamFactory {
  constructor(private readonly bytes: Uint8Array) {}

  create(): ReadableStream<Uint8Array> {
    const value = this.bytes;
    let consumed = false;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (consumed) {
          controller.close();
          return;
        }
        consumed = true;
        controller.enqueue(value);
        controller.close();
      },
    });
  }
}
