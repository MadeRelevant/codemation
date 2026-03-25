export function parseCredentialInstanceTestPayload(text: string): { status?: string; message?: string } {
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as { status?: string; message?: string };
  } catch {
    return { message: text || "Test failed" };
  }
}
