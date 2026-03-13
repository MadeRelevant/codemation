export class ServerHttpRouteSegment {
  readonly name: string;

  readonly isParameter: boolean;

  constructor(value: string) {
    this.isParameter = value.startsWith(":");
    this.name = this.isParameter ? value.slice(1) : value;
  }

  matches(segment: string): boolean {
    return this.isParameter || this.name === segment;
  }
}
