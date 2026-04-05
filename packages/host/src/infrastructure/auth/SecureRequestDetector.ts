import { injectable } from "@codemation/core";

/**
 * Single source of truth for whether the incoming request should be treated as HTTPS
 * (cookie {@code Secure} flag, {@code __Host-} / {@code __Secure-} names, Auth.js {@code secureCookie}).
 */
@injectable()
export class SecureRequestDetector {
  isSecureRequest(request: Request): boolean {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (forwardedProto === "https") {
      return true;
    }
    return new URL(request.url).protocol === "https:";
  }
}
