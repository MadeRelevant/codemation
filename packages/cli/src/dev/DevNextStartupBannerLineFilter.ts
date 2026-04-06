/**
 * Filters noisy Next.js `next start` / `next dev` startup lines so the CLI can
 * surface the Codemation gateway URL as the primary “where to browse” signal.
 */
export class DevNextStartupBannerLineFilter {
  shouldSuppress(line: string): boolean {
    const t = line.replace(/\r$/, "").trimEnd();
    if (t.length === 0) {
      return false;
    }
    if (/^\s*▲\s+Next\.js/.test(t)) {
      return true;
    }
    if (/^\s*-\s+Local:\s+/.test(t)) {
      return true;
    }
    if (/^\s*-\s+Network:\s+/.test(t)) {
      return true;
    }
    if (/^\s*✓\s+Ready\b/.test(t)) {
      return true;
    }
    return false;
  }
}
