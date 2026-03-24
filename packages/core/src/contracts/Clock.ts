/** Port for time; inject `SystemClock` in production and a fake/test clock in tests. */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
