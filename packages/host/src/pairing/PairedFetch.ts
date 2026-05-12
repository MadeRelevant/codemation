import { inject, injectable } from "@codemation/core";
import { HmacRequestSigner } from "./HmacRequestSigner";

/**
 * Thin fetch wrapper that automatically HMAC-signs outgoing requests
 * to the control plane using the workspace's pairing secret.
 *
 * Use this for any server-to-server request from the installation to the CP.
 */
@injectable()
export class PairedFetch {
  constructor(@inject(HmacRequestSigner) private readonly signer: HmacRequestSigner) {}

  async get(url: string): Promise<Response> {
    const headers = this.signer.sign("GET", url, "");
    return fetch(url, { method: "GET", headers: { ...headers } });
  }

  async post(url: string, body: unknown): Promise<Response> {
    const bodyString = JSON.stringify(body);
    const headers = this.signer.sign("POST", url, bodyString);
    return fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: bodyString,
    });
  }

  async delete(url: string): Promise<Response> {
    const headers = this.signer.sign("DELETE", url, "");
    return fetch(url, { method: "DELETE", headers: { ...headers } });
  }
}
