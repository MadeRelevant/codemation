import type { ServerHttpRouteHandlerFunction } from "./ServerHttpRouteHandlerFunction";
import type { ServerHttpRouteParams } from "./ServerHttpRouteParams";
import { ServerHttpRoutePattern } from "./ServerHttpRoutePattern";

export class ServerHttpRouteDefinition {
  private readonly pattern: ServerHttpRoutePattern;

  constructor(
    readonly method: string,
    pattern: string,
    private readonly handler: ServerHttpRouteHandlerFunction,
  ) {
    this.pattern = new ServerHttpRoutePattern(pattern);
  }

  match(method: string, pathSegments: ReadonlyArray<string>): ServerHttpRouteParams | null {
    if (this.method !== method) {
      return null;
    }
    return this.pattern.match(pathSegments);
  }

  async handle(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    return await this.handler(request, params);
  }
}
