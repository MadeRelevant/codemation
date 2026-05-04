/**
 * Merges query parameters into a base URL.
 * Handles both scalar and array values, and preserves any existing params.
 */
export class HttpUrlBuilder {
  build(baseUrl: string, query?: Readonly<Record<string, string | string[]>>): string {
    if (!query || Object.keys(query).length === 0) {
      return baseUrl;
    }
    const parsed = new URL(baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          parsed.searchParams.append(key, entry);
        }
      } else {
        parsed.searchParams.append(key, value);
      }
    }
    return parsed.toString();
  }
}
