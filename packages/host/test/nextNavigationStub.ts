import { useMemo, useSyncExternalStore } from "react";

/** Matches {@link WorkflowDetailFixtureFactory.workflowId} — keep in sync for URL state in UI tests. */
const DEFAULT_WORKFLOW_DETAIL_WORKFLOW_ID = "wf.frontend.realtime";

type AppRouterInstance = Readonly<{
  back(): void;
  forward(): void;
  prefetch(href: string): void;
  push(href: string): void;
  refresh(): void;
  replace(href: string): void;
}>;

type NavigationSnapshot = Readonly<{
  pathname: string;
  searchParams: URLSearchParams;
}>;

class NextNavigationTestDouble {
  private snapshot: NavigationSnapshot = NextNavigationTestDouble.createDefaultSnapshot();

  private static createDefaultSnapshot(): NavigationSnapshot {
    return {
      pathname: `/workflows/${DEFAULT_WORKFLOW_DETAIL_WORKFLOW_ID}`,
      searchParams: new URLSearchParams(),
    };
  }

  private listeners = new Set<() => void>();

  reset(): void {
    this.snapshot = NextNavigationTestDouble.createDefaultSnapshot();
    this.emit();
  }

  /** Align URL pathname with the workflow under test (defaults in reset() use the standard fixture id). */
  configureForWorkflow(workflowId: string): void {
    this.snapshot = {
      pathname: `/workflows/${workflowId}`,
      searchParams: new URLSearchParams(),
    };
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): NavigationSnapshot => this.snapshot;

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private applyHref(href: string): void {
    const url = new URL(href, "http://localhost");
    this.snapshot = {
      pathname: url.pathname,
      searchParams: new URLSearchParams(url.search),
    };
    this.emit();
  }

  createRouter(): AppRouterInstance {
    return {
      back: () => {},
      forward: () => {},
      prefetch: () => {},
      push: (href: string) => {
        this.applyHref(href);
      },
      refresh: () => {},
      replace: (href: string) => {
        this.applyHref(href);
      },
    };
  }
}

const nextNavigationTestDouble = new NextNavigationTestDouble();

/** Resets URL state between UI tests (`isolate: false` shares this module). */
export function resetNextNavigationTestDouble(): void {
  nextNavigationTestDouble.reset();
}

export function configureWorkflowDetailNavigationForUiTest(workflowId: string): void {
  nextNavigationTestDouble.configureForWorkflow(workflowId);
}

export function useRouter(): AppRouterInstance {
  return useMemo(() => nextNavigationTestDouble.createRouter(), []);
}

export function usePathname(): string {
  return useSyncExternalStore(
    nextNavigationTestDouble.subscribe,
    () => nextNavigationTestDouble.getSnapshot().pathname,
    () => nextNavigationTestDouble.getSnapshot().pathname,
  );
}

export function useSearchParams() {
  return useSyncExternalStore(
    nextNavigationTestDouble.subscribe,
    () => nextNavigationTestDouble.getSnapshot().searchParams,
    () => nextNavigationTestDouble.getSnapshot().searchParams,
  );
}
