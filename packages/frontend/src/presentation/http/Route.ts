export type ServerHttpRouteMetadata = Readonly<{
  method: string;
  path: string;
  propertyKey: string;
}>;

export const serverHttpRouteMetadataKey = Symbol.for("codemation.presentation.http.Route");

export class Route {
  static for(method: string, path: string): MethodDecorator {
    return (_target, propertyKey) => {
      const targetConstructor = (_target as Readonly<{ constructor: object }>).constructor;
      const currentRoutes = (Reflect.getMetadata(serverHttpRouteMetadataKey, targetConstructor) as ReadonlyArray<ServerHttpRouteMetadata> | undefined) ?? [];
      Reflect.defineMetadata(
        serverHttpRouteMetadataKey,
        [...currentRoutes, { method, path, propertyKey: String(propertyKey) }],
        targetConstructor,
      );
    };
  }
}
