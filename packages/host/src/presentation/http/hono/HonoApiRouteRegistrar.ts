import type { Hono } from "hono";

export interface HonoApiRouteRegistrar {
  register(app: Hono): void;
}
