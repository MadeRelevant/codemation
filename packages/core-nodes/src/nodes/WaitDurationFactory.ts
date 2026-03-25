export class WaitDuration {
  static normalize(milliseconds: number): number {
    return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.floor(milliseconds) : 0;
  }
}
