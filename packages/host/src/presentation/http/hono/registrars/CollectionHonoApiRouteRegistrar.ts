import { inject, injectable } from "@codemation/core";
import { Hono } from "hono";
import { CollectionHttpRouteHandler } from "../../routeHandlers/CollectionHttpRouteHandlerFactory";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
export class CollectionHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(CollectionHttpRouteHandler) private readonly handler: CollectionHttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/collections", () => this.handler.getCollections());
    app.post("/collections/sync", (c) => this.handler.postSyncCollections(c.req.raw));
    app.get("/collections/:collectionName", (c) =>
      this.handler.getCollection(c.req.raw, { collectionName: c.req.param("collectionName") }),
    );
    app.get("/collections/:collectionName/rows", (c) =>
      this.handler.getCollectionRows(c.req.raw, { collectionName: c.req.param("collectionName") }),
    );
    app.post("/collections/:collectionName/rows", (c) =>
      this.handler.postCollectionRow(c.req.raw, { collectionName: c.req.param("collectionName") }),
    );
    app.get("/collections/:collectionName/rows/:rowId", (c) =>
      this.handler.getCollectionRow(c.req.raw, {
        collectionName: c.req.param("collectionName"),
        rowId: c.req.param("rowId"),
      }),
    );
    app.patch("/collections/:collectionName/rows/:rowId", (c) =>
      this.handler.patchCollectionRow(c.req.raw, {
        collectionName: c.req.param("collectionName"),
        rowId: c.req.param("rowId"),
      }),
    );
    app.delete("/collections/:collectionName/rows/:rowId", (c) =>
      this.handler.deleteCollectionRow(c.req.raw, {
        collectionName: c.req.param("collectionName"),
        rowId: c.req.param("rowId"),
      }),
    );
  }
}
