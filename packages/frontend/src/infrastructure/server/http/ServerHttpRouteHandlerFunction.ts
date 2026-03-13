import type { ServerHttpRouteParams } from "./ServerHttpRouteParams";

export type ServerHttpRouteHandlerFunction = (request: Request, params: ServerHttpRouteParams) => Promise<Response>;
