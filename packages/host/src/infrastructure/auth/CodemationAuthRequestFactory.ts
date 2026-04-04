import { injectable } from "@codemation/core";

@injectable()
export class CodemationAuthRequestFactory {
  create(url: URL, request: Request, method: string): Request {
    return new Request(url, {
      headers: request.headers,
      method,
    });
  }
}
