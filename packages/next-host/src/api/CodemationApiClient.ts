import { CodemationApiHttpError } from "./CodemationApiHttpError";

const defaultInit: Readonly<RequestInit> = {
  cache: "no-store",
  credentials: "same-origin",
};

function mergeHeaders(base: HeadersInit | undefined, extra: HeadersInit | undefined): Headers {
  const headers = new Headers(base);
  if (extra) {
    const next = new Headers(extra);
    next.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

/**
 * Single place for browser calls to the Codemation App Router `/api/*` surface.
 * Uses same-origin cookies (session) and consistent JSON + error handling.
 */
export class CodemationApiClient {
  private async requestOrThrow(url: string, init: RequestInit): Promise<Response> {
    const response = await fetch(url, { ...defaultInit, ...init });
    if (!response.ok) {
      const bodyText = typeof response.text === "function" ? await response.text() : "";
      throw new CodemationApiHttpError(response.status, bodyText);
    }
    return response;
  }

  private async parseJsonBody<T>(response: Response): Promise<T> {
    if (typeof response.json === "function") {
      try {
        const data = await response.json();
        return data as T;
      } catch {
        // Empty or invalid JSON body — try text fallback when available.
      }
    }
    if (typeof response.text === "function") {
      const text = await response.text();
      if (!text.trim()) {
        return undefined as T;
      }
      return JSON.parse(text) as T;
    }
    return undefined as T;
  }

  async getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.requestOrThrow(url, { method: "GET", ...init });
    return this.parseJsonBody<T>(response);
  }

  async postJson<TResponse>(url: string, body?: unknown, init?: RequestInit): Promise<TResponse> {
    const headers = mergeHeaders(init?.headers, { "content-type": "application/json" });
    const response = await this.requestOrThrow(url, {
      ...init,
      method: "POST",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.parseJsonBody<TResponse>(response);
  }

  async putJson<TResponse>(url: string, body: unknown, init?: RequestInit): Promise<TResponse> {
    const headers = mergeHeaders(init?.headers, { "content-type": "application/json" });
    const response = await this.requestOrThrow(url, {
      ...init,
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    return this.parseJsonBody<TResponse>(response);
  }

  async patchJson<TResponse>(url: string, body: unknown, init?: RequestInit): Promise<TResponse> {
    const headers = mergeHeaders(init?.headers, { "content-type": "application/json" });
    const response = await this.requestOrThrow(url, {
      ...init,
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    return this.parseJsonBody<TResponse>(response);
  }

  async delete(url: string, init?: RequestInit): Promise<void> {
    await this.requestOrThrow(url, { method: "DELETE", ...init });
  }

  /** Multipart upload (browser sets Content-Type with boundary). */
  async postFormData<T>(url: string, formData: FormData, init?: RequestInit): Promise<T> {
    const response = await this.requestOrThrow(url, {
      ...init,
      method: "POST",
      body: formData,
      headers: init?.headers,
    });
    return this.parseJsonBody<T>(response);
  }
}

/** Shared client for next-host UI modules (same-origin `/api/*`). */
export const codemationApiClient = new CodemationApiClient();
