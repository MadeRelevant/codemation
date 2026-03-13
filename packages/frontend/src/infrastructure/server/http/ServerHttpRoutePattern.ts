import { ServerHttpRouteParams } from "./ServerHttpRouteParams";
import { ServerHttpRouteSegment } from "./ServerHttpRouteSegment";

export class ServerHttpRoutePattern {
  private readonly segments: ReadonlyArray<ServerHttpRouteSegment>;

  constructor(pattern: string) {
    this.segments = pattern.split("/").filter(Boolean).map((segment) => new ServerHttpRouteSegment(segment));
  }

  match(pathSegments: ReadonlyArray<string>): ServerHttpRouteParams | null {
    if (pathSegments.length !== this.segments.length) {
      return null;
    }
    const params: Record<string, string> = {};
    for (const [index, patternSegment] of this.segments.entries()) {
      const pathSegment = pathSegments[index]!;
      if (!patternSegment.matches(pathSegment)) {
        return null;
      }
      if (patternSegment.isParameter) {
        params[patternSegment.name] = pathSegment;
      }
    }
    return params;
  }
}
