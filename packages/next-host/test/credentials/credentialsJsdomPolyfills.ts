/**
 * Radix Select / dialogs expect pointer capture and scroll APIs in JSDOM.
 * Call once per suite `beforeAll`, or import from a shared setup.
 */
export function installCredentialsJsdomPolyfills(): void {
  if (typeof Element.prototype.hasPointerCapture !== "function") {
    Element.prototype.hasPointerCapture = (): boolean => false;
  }
  if (typeof Element.prototype.setPointerCapture !== "function") {
    Element.prototype.setPointerCapture = (): void => {};
  }
  if (typeof Element.prototype.releasePointerCapture !== "function") {
    Element.prototype.releasePointerCapture = (): void => {};
  }
  if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = (): void => {};
  }
}
