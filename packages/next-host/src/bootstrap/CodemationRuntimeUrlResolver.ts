export class CodemationRuntimeUrlResolver {
  resolve(pathname: string): string {
    const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const runtimeDevUrl = process.env.CODEMATION_RUNTIME_DEV_URL?.trim();
    if (runtimeDevUrl && runtimeDevUrl.length > 0) {
      return `${runtimeDevUrl.replace(/\/$/, "")}${normalizedPath}`;
    }
    const publicBaseUrl = process.env.AUTH_URL?.trim();
    if (publicBaseUrl && publicBaseUrl.length > 0) {
      return `${publicBaseUrl.replace(/\/$/, "")}${normalizedPath}`;
    }
    const port = process.env.PORT?.trim() || "3000";
    return `http://127.0.0.1:${port}${normalizedPath}`;
  }
}
