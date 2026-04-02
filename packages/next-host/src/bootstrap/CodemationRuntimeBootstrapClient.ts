import {
  InternalAuthBootstrapJsonCodec,
  PublicFrontendBootstrapJsonCodec,
  type InternalAuthBootstrap,
  type PublicFrontendBootstrap,
} from "@codemation/host/client";

import { CodemationRuntimeUrlResolver } from "./CodemationRuntimeUrlResolver";

export class CodemationRuntimeBootstrapClient {
  private static readonly internalAuthBootstrapPath = "/api/bootstrap/auth/internal";
  private static readonly publicFrontendBootstrapPath = "/api/bootstrap/frontend";
  private readonly internalAuthBootstrapJsonCodec = new InternalAuthBootstrapJsonCodec();
  private readonly publicFrontendBootstrapJsonCodec = new PublicFrontendBootstrapJsonCodec();
  private readonly runtimeUrlResolver = new CodemationRuntimeUrlResolver();

  async getInternalAuthBootstrap(): Promise<InternalAuthBootstrap> {
    const response = await this.fetchBootstrap(CodemationRuntimeBootstrapClient.internalAuthBootstrapPath);
    const payload = this.internalAuthBootstrapJsonCodec.deserialize(await response.text());
    if (!payload) {
      throw new Error("Runtime returned an invalid internal auth bootstrap payload.");
    }
    return payload;
  }

  async getPublicFrontendBootstrap(): Promise<PublicFrontendBootstrap> {
    const response = await this.fetchBootstrap(CodemationRuntimeBootstrapClient.publicFrontendBootstrapPath);
    const payload = this.publicFrontendBootstrapJsonCodec.deserialize(await response.text());
    if (!payload) {
      throw new Error("Runtime returned an invalid public frontend bootstrap payload.");
    }
    return payload;
  }

  private async fetchBootstrap(pathname: string): Promise<Response> {
    const response = await fetch(this.runtimeUrlResolver.resolve(pathname), { cache: "no-store" });
    return await this.ensureSuccess(response, pathname);
  }

  private async ensureSuccess(response: Response, pathname: string): Promise<Response> {
    if (response.ok) {
      return response;
    }
    const body = await response.text();
    throw new Error(
      `Runtime bootstrap request failed for ${pathname} with ${response.status}${body.length > 0 ? `: ${body}` : "."}`,
    );
  }
}
