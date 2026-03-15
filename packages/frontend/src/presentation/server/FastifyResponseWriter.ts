import type { FastifyReply } from "fastify";

export class FastifyResponseWriter {
  async write(reply: FastifyReply, response: Response): Promise<void> {
    reply.status(response.status);
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });
    reply.send(await this.resolveBody(response));
  }

  private async resolveBody(response: Response): Promise<Buffer | undefined> {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return undefined;
    }
    return Buffer.from(arrayBuffer);
  }
}
