/**
 * Mints fresh {@link AbortController}s. Injected (rather than direct `new`) to honor the
 * codebase's no-direct-construction rule and to give tests a seam for substituting a fake.
 */
export class AbortControllerFactory {
  create(): AbortController {
    return new AbortController();
  }
}
